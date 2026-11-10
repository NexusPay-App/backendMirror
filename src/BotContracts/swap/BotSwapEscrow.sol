// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BotContractBase } from "../common/BotContractBase.sol";

/// @title BotSwapEscrow
/// @notice OTC settlement for BOT Chain swaps against platform inventory.
///
/// @dev Why an escrow and not a pool
///      ------------------------------
///      No swap venue on BOT Chain is confirmed today, and `botCapabilities()` reports
///      `swaps: false`. A constant-product pool would be a market maker with unbounded inventory
///      risk and no oracle. What the business actually runs is OTC: a price is quoted, the user's
///      asset comes in, the counter-asset leaves from inventory, and the platform keeps the spread.
///      This contract makes that settlement atomic and accountable.
///
///      Both directions work, including native BOT:
///        - sell USDT for BOT: `tokenIn` = USDT, `tokenOut` = address(0)
///        - sell BOT for USDT: `tokenIn` = address(0), `tokenOut` = USDT
///      Native inventory is funded by sending BOT to the contract; erc-20 inventory by transfer.
///
///      Safety properties
///      -----------------
///      1. A swap is atomic: either both legs move in the same transaction, or neither does. The
///         user is never left with funds sitting in the contract waiting on an operator.
///      2. `amountIn`, `amountOut`, `minOut`, `expiresAt` and `recipient` are all inside the signed
///         quote, so a user who is shown a price cannot be filled at a worse one, and a third party
///         cannot execute someone else's quote for themselves.
///      3. Each quote is single-use, keyed by its EIP-712 struct hash.
///      4. The contract holds inventory, never user funds: no deposit path exists.
///      5. `feeBps` is informational and signed; the spread is realized as retained inventory, which
///         keeps settlement to exactly two transfers and no fee accounting bugs.
contract BotSwapEscrow is BotContractBase {
    // ---------------------------------------------------------------------------
    // EIP-712 type
    // ---------------------------------------------------------------------------

    bytes32 public constant SWAP_QUOTE_TYPEHASH =
        keccak256(
            "SwapQuote(address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,address trader,address recipient,uint256 minOut,uint256 feeBps,uint256 expiresAt,uint256 nonce)"
        );

    /// @notice The quote a broker signs before a user swaps.
    /// @dev `tokenIn` / `tokenOut` use `address(0)` for native BOT.
    struct SwapQuote {
        address tokenIn;
        uint256 amountIn;
        address tokenOut;
        uint256 amountOut;
        address trader;
        address recipient;
        uint256 minOut;
        uint256 feeBps;
        uint256 expiresAt;
        uint256 nonce;
    }

    // ---------------------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------------------

    /// @notice Address authorized to sign swap quotes.
    address public broker;

    // ---------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------

    mapping(bytes32 => bool) private _used;

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------

    event SwapExecuted(
        bytes32 indexed quoteId,
        address indexed trader,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        uint256 feeBps
    );
    event InventoryWithdrawn(address indexed token, address indexed to, uint256 amount);
    event BrokerChanged(address indexed previous, address indexed next);

    // ---------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------

    error QuoteExpired(uint256 expiresAt);
    error QuoteAlreadyUsed(bytes32 quoteId);
    error QuoteTraderMismatch(address expected, address caller);
    error QuoteRecipientMismatch(address expected, address caller);
    error QuoteSameToken();
    error QuoteInvalidAmount();
    error QuoteBelowMinOut(uint256 amountOut, uint256 minOut);
    error UnexpectedNativeValue(uint256 sent);
    error NativeValueMismatch(uint256 expected, uint256 sent);
    error ZeroBroker();
    error InsufficientInventory(address token, uint256 available, uint256 required);

    // ---------------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------------

    constructor(address initialOwner, address initialBroker)
        BotContractBase(initialOwner, "NexusPay BotSwap")
    {
        if (initialBroker == address(0)) revert ZeroBroker();
        broker = initialBroker;
    }

    /// @dev Accept native BOT inventory funding.
    receive() external payable {}

    // ---------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------

    function setBroker(address nextBroker) external onlyOwner {
        if (nextBroker == address(0)) revert ZeroBroker();
        emit BrokerChanged(broker, nextBroker);
        broker = nextBroker;
    }

    /// @notice Move inventory out. `token` = address(0) moves native BOT.
    function withdrawInventory(address token, address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert QuoteInvalidAmount();
        uint256 available = _balanceOf(token);
        if (available < amount) revert InsufficientInventory(token, available, amount);

        if (token == address(0)) {
            _safeTransferNative(to, amount);
        } else {
            _safeTransfer(token, to, amount);
        }

        emit InventoryWithdrawn(token, to, amount);
    }

    // ---------------------------------------------------------------------------
    // Quote hashing (must match shared/signing.ts)
    // ---------------------------------------------------------------------------

    function quoteIdOf(SwapQuote calldata quote) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SWAP_QUOTE_TYPEHASH,
                    quote.tokenIn,
                    quote.amountIn,
                    quote.tokenOut,
                    quote.amountOut,
                    quote.trader,
                    quote.recipient,
                    quote.minOut,
                    quote.feeBps,
                    quote.expiresAt,
                    quote.nonce
                )
            );
    }

    function quoteDigest(SwapQuote calldata quote) external view returns (bytes32) {
        return _hashTypedData(quoteIdOf(quote));
    }

    // ---------------------------------------------------------------------------
    // Swap
    // ---------------------------------------------------------------------------

    /// @notice Settle a signed quote atomically against inventory.
    /// @dev Send `quote.amountIn` as `msg.value` when `tokenIn` is native; otherwise approve this
    ///      contract for `quote.amountIn` and send no value.
    function swap(SwapQuote calldata quote, bytes calldata signature)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (bytes32 quoteId)
    {
        if (quote.tokenIn == quote.tokenOut) revert QuoteSameToken();
        if (quote.amountIn == 0 || quote.amountOut == 0) revert QuoteInvalidAmount();
        _requireFeeBps(quote.feeBps);
        if (quote.trader != msg.sender) revert QuoteTraderMismatch(quote.trader, msg.sender);
        if (quote.recipient != msg.sender) revert QuoteRecipientMismatch(quote.recipient, msg.sender);
        if (quote.amountOut < quote.minOut) revert QuoteBelowMinOut(quote.amountOut, quote.minOut);
        if (quote.expiresAt < block.timestamp) revert QuoteExpired(quote.expiresAt);

        quoteId = quoteIdOf(quote);
        if (_used[quoteId]) revert QuoteAlreadyUsed(quoteId);

        _requireSigner(_hashTypedData(quoteId), signature, broker);

        // Mark used before any external call (checks-effects-interactions).
        _used[quoteId] = true;

        // Pull the input leg.
        if (quote.tokenIn == address(0)) {
            if (msg.value != quote.amountIn) revert NativeValueMismatch(quote.amountIn, msg.value);
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue(msg.value);
            _safeTransferFrom(quote.tokenIn, msg.sender, address(this), quote.amountIn);
        }

        // Push the output leg from inventory.
        uint256 available = _balanceOf(quote.tokenOut);
        if (available < quote.amountOut) {
            revert InsufficientInventory(quote.tokenOut, available, quote.amountOut);
        }
        if (quote.tokenOut == address(0)) {
            _safeTransferNative(msg.sender, quote.amountOut);
        } else {
            _safeTransfer(quote.tokenOut, msg.sender, quote.amountOut);
        }

        emit SwapExecuted(
            quoteId,
            msg.sender,
            quote.tokenIn,
            quote.amountIn,
            quote.tokenOut,
            quote.amountOut,
            quote.feeBps
        );
    }

    // ---------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------

    function isQuoteUsed(bytes32 quoteId) external view returns (bool) {
        return _used[quoteId];
    }

    function inventory(address token) external view returns (uint256) {
        return _balanceOf(token);
    }
}
