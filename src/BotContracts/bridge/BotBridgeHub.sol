// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BotContractBase } from "../common/BotContractBase.sol";

/// @title BotBridgeHub
/// @notice Arbitrum-side escrow for NexusPay bridge intents that end on BOT Chain.
///
/// @dev What this contract is
///      ----------------------
///      A user locks a source asset on Arbitrum against a broker-signed quote. The quote binds
///      the source token, the exact amount, the BOT destination chain, the BOT destination token,
///      the BOT destination address, the minimum BOT-side amount and an expiry. An operator then
///      releases the BOT-side payout from platform inventory and records the BOT payout reference
///      here. Nothing about the BOT payout is inferred: it is the exact `destAccount` in the quote.
///
///      What this contract is not
///      -------------------------
///      It is not a light client, not a message bridge, and it does not verify BOT Chain state.
///      There is no native Arbitrum <-> BOT Chain bridge available to call today, so the BOT side
///      is an operator release backed by platform inventory. The contract's job is to make that
///      release accountable: no deposit without a signed quote, no release for an unknown quote,
///      no double release, and a refund path that always returns the user's asset.
///
///      Safety properties
///      -----------------
///      1. The hub can never take a user's asset permanently: after `releaseDeadline` the depositor
///         can always refund, unless the escrow was already released.
///      2. A quote is single-use. `quoteId` is the EIP-712 struct hash of the quote, and the same
///         quote cannot be deposited twice, so a captured signature cannot be replayed.
///      3. The destination address is signed, and deposit requires the trader to be `msg.sender`,
///         so a third party cannot redirect or harvest someone else's signed quote.
///      4. Release is possible only until `releaseDeadline`; after that the user's refund wins.
///      5. Released funds stay in the hub as Arbitrum-side inventory and can only be swept by the
///         owner, which is expected to be the platform multisig.
contract BotBridgeHub is BotContractBase {
    // ---------------------------------------------------------------------------
    // EIP-712 type
    // ---------------------------------------------------------------------------

    /// @dev Field order must match `BridgeQuote` exactly. `quoteId` is the struct hash itself,
    ///      so the quote cannot carry a self-referential id.
    bytes32 public constant BRIDGE_QUOTE_TYPEHASH =
        keccak256(
            "BridgeQuote(address token,uint256 amountIn,address trader,uint256 destChainId,address destToken,address destAccount,uint256 minOut,uint256 feeBps,uint256 expiresAt,uint256 nonce)"
        );

    /// @notice The quote a broker signs before a user locks funds.
    struct BridgeQuote {
        address token;
        uint256 amountIn;
        address trader;
        uint256 destChainId;
        address destToken;
        address destAccount;
        uint256 minOut;
        uint256 feeBps;
        uint256 expiresAt;
        uint256 nonce;
    }

    /// @notice One locked deposit, keyed by quote id.
    struct Escrow {
        address depositor;
        address token;
        uint256 amountIn;
        uint256 destChainId;
        address destToken;
        address destAccount;
        uint256 minOut;
        uint256 feeBps;
        uint64 depositedAt;
        uint64 expiresAt;
        uint64 releaseDeadline;
        bool released;
        bool refunded;
        bytes32 botPayoutRef;
    }

    // ---------------------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------------------

    /// @notice Address authorized to sign bridge quotes.
    address public broker;

    /// @notice Address authorized to release the BOT side of an escrow.
    address public operator;

    /// @notice BOT Chain id this hub pays out to.
    uint256 public immutable botChainId;

    /// @notice How long after `expiresAt` an operator may still complete the BOT payout.
    ///         After this window the depositor can always refund.
    uint64 public immutable settlementWindow;

    // ---------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------

    mapping(bytes32 => Escrow) private _escrows;

    /// @dev One BOT payout reference may settle exactly one escrow. Without this, an operator
    ///      could point two deposits at the same BOT transaction and both would look settled.
    mapping(bytes32 => bool) private _payoutRefUsed;

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------

    event BridgeDeposit(
        bytes32 indexed quoteId,
        address indexed depositor,
        address indexed token,
        uint256 amountIn,
        uint256 destChainId,
        address destToken,
        address destAccount,
        uint256 minOut,
        uint64 releaseDeadline
    );
    event BridgeReleased(bytes32 indexed quoteId, address indexed destAccount, bytes32 botPayoutRef);
    event BridgeRefunded(bytes32 indexed quoteId, address indexed depositor, address token, uint256 amountIn);
    event InventorySwept(bytes32 indexed quoteId, address indexed token, address indexed to, uint256 amount);
    event BrokerChanged(address indexed previous, address indexed next);
    event OperatorChanged(address indexed previous, address indexed next);

    // ---------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------

    error QuoteExpired(uint64 expiresAt);
    error QuoteAlreadyUsed(bytes32 quoteId);
    error QuoteTraderMismatch(address expected, address caller);
    error QuoteChainMismatch(uint256 expected, uint256 got);
    error QuoteDestinationZero();
    error QuoteExpiryTooFar(uint256 expiresAt);
    error ZeroPayoutRef();
    error PayoutRefReused(bytes32 payoutRef);
    error QuoteInvalidAmount();
    error QuoteInvalidToken();
    error QuoteNotReleased(bytes32 quoteId);
    error QuoteAlreadyReleased(bytes32 quoteId);
    error QuoteAlreadyRefunded(bytes32 quoteId);
    error QuoteUnknown(bytes32 quoteId);
    error ReleaseWindowClosed(uint64 releaseDeadline);
    error NotOperator(address caller);
    error ZeroBroker();
    error ZeroOperator();

    // ---------------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------------

    constructor(
        address initialOwner,
        address initialBroker,
        address initialOperator,
        uint256 botChainId_,
        uint64 settlementWindow_
    ) BotContractBase(initialOwner, "NexusPay BotBridge") {
        if (initialBroker == address(0)) revert ZeroBroker();
        if (initialOperator == address(0)) revert ZeroOperator();
        broker = initialBroker;
        operator = initialOperator;
        botChainId = botChainId_;
        settlementWindow = settlementWindow_;
    }

    // ---------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------

    function setBroker(address nextBroker) external onlyOwner {
        if (nextBroker == address(0)) revert ZeroBroker();
        emit BrokerChanged(broker, nextBroker);
        broker = nextBroker;
    }

    function setOperator(address nextOperator) external onlyOwner {
        if (nextOperator == address(0)) revert ZeroOperator();
        emit OperatorChanged(operator, nextOperator);
        operator = nextOperator;
    }

    // ---------------------------------------------------------------------------
    // Quote hashing (must match shared/signing.ts)
    // ---------------------------------------------------------------------------

    /// @notice Struct hash of a quote. This is also the `quoteId` used everywhere else.
    function quoteIdOf(BridgeQuote calldata quote) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BRIDGE_QUOTE_TYPEHASH,
                    quote.token,
                    quote.amountIn,
                    quote.trader,
                    quote.destChainId,
                    quote.destToken,
                    quote.destAccount,
                    quote.minOut,
                    quote.feeBps,
                    quote.expiresAt,
                    quote.nonce
                )
            );
    }

    /// @notice EIP-712 digest the broker signs for a quote.
    function quoteDigest(BridgeQuote calldata quote) external view returns (bytes32) {
        return _hashTypedData(quoteIdOf(quote));
    }

    // ---------------------------------------------------------------------------
    // Deposit
    // ---------------------------------------------------------------------------

    /// @notice Lock `quote.amountIn` of `quote.token` from the caller against a signed quote.
    /// @dev Requires the caller to have approved this contract for at least `quote.amountIn`.
    ///      The exact amount is enforced, never a balance diff, so a partial or inflated transfer
    ///      cannot turn into a different escrow than the one that was signed.
    function deposit(BridgeQuote calldata quote, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (bytes32 quoteId)
    {
        if (quote.token == address(0)) revert QuoteInvalidToken();
        if (quote.amountIn == 0) revert QuoteInvalidAmount();
        if (quote.trader != msg.sender) revert QuoteTraderMismatch(quote.trader, msg.sender);
        if (quote.destChainId != botChainId) revert QuoteChainMismatch(botChainId, quote.destChainId);
        if (quote.destAccount == address(0)) revert QuoteDestinationZero();
        _requireFeeBps(quote.feeBps);
        if (quote.expiresAt < block.timestamp) revert QuoteExpired(uint64(quote.expiresAt));

        // The expiry is stored in the packed uint64 escrow fields below. Refuse values that would
        // truncate, because a truncated expiry would silently move the refund deadline.
        if (quote.expiresAt > type(uint64).max - settlementWindow) revert QuoteExpiryTooFar(quote.expiresAt);

        quoteId = quoteIdOf(quote);
        if (_escrows[quoteId].depositor != address(0)) revert QuoteAlreadyUsed(quoteId);

        _requireSigner(_hashTypedData(quoteId), signature, broker);

        uint64 releaseDeadline = uint64(quote.expiresAt) + settlementWindow;

        _escrows[quoteId] = Escrow({
            depositor: msg.sender,
            token: quote.token,
            amountIn: quote.amountIn,
            destChainId: quote.destChainId,
            destToken: quote.destToken,
            destAccount: quote.destAccount,
            minOut: quote.minOut,
            feeBps: quote.feeBps,
            depositedAt: uint64(block.timestamp),
            expiresAt: uint64(quote.expiresAt),
            releaseDeadline: releaseDeadline,
            released: false,
            refunded: false,
            botPayoutRef: bytes32(0)
        });

        // Pull the exact signed amount. Reverts wholesale if the allowance or balance is short.
        _safeTransferFrom(quote.token, msg.sender, address(this), quote.amountIn);

        emit BridgeDeposit(
            quoteId,
            msg.sender,
            quote.token,
            quote.amountIn,
            quote.destChainId,
            quote.destToken,
            quote.destAccount,
            quote.minOut,
            releaseDeadline
        );
    }

    // ---------------------------------------------------------------------------
    // Release (BOT side)
    // ---------------------------------------------------------------------------

    /// @notice Record that the BOT-side payout for `quoteId` was sent, and anchor its reference.
    /// @dev `botPayoutRef` is the BOT Chain transaction hash of the payout from inventory. It is an
    ///      audit anchor only; this contract does not verify BOT Chain state.
    ///      Gated by `whenNotPaused`: a pause stops new payouts. The refund path is never paused,
    ///      so a paused contract can still return every deposit to its owner.
    function release(bytes32 quoteId, bytes32 botPayoutRef)
        external
        whenNotPaused
        nonReentrant
    {
        if (msg.sender != operator) revert NotOperator(msg.sender);
        if (botPayoutRef == bytes32(0)) revert ZeroPayoutRef();

        Escrow storage escrow = _escrows[quoteId];
        if (escrow.depositor == address(0)) revert QuoteUnknown(quoteId);
        if (escrow.refunded) revert QuoteAlreadyRefunded(quoteId);
        if (escrow.released) revert QuoteAlreadyReleased(quoteId);
        if (block.timestamp > escrow.releaseDeadline) revert ReleaseWindowClosed(escrow.releaseDeadline);
        if (_payoutRefUsed[botPayoutRef]) revert PayoutRefReused(botPayoutRef);

        _payoutRefUsed[botPayoutRef] = true;
        escrow.released = true;
        escrow.botPayoutRef = botPayoutRef;

        emit BridgeReleased(quoteId, escrow.destAccount, botPayoutRef);
    }

    // ---------------------------------------------------------------------------
    // Refund
    // ---------------------------------------------------------------------------

    /// @notice Return the locked asset to the depositor after the release window closes.
    /// @dev Intentionally not gated by `whenNotPaused`: pausing intake must never trap funds.
    function refund(bytes32 quoteId) external nonReentrant {
        Escrow storage escrow = _escrows[quoteId];
        if (escrow.depositor == address(0)) revert QuoteUnknown(quoteId);
        if (escrow.depositor != msg.sender) revert QuoteTraderMismatch(escrow.depositor, msg.sender);
        if (escrow.released) revert QuoteAlreadyReleased(quoteId);
        if (escrow.refunded) revert QuoteAlreadyRefunded(quoteId);
        if (block.timestamp <= escrow.releaseDeadline) revert ReleaseWindowClosed(escrow.releaseDeadline);

        uint256 amount = escrow.amountIn;
        escrow.amountIn = 0;
        escrow.refunded = true;

        _safeTransfer(escrow.token, msg.sender, amount);

        emit BridgeRefunded(quoteId, msg.sender, escrow.token, amount);
    }

    // ---------------------------------------------------------------------------
    // Treasury
    // ---------------------------------------------------------------------------

    /// @notice Sweep the Arbitrum-side inventory produced by released escrows.
    /// @dev Only released escrows can be swept, and only for their own token and amount, so a
    ///      sweep can never touch a user's un-settled or refundable deposit.
    function sweepReleased(bytes32 quoteId, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        Escrow storage escrow = _escrows[quoteId];
        if (escrow.depositor == address(0)) revert QuoteUnknown(quoteId);
        if (!escrow.released) revert QuoteNotReleased(quoteId);

        uint256 amount = escrow.amountIn;
        if (amount == 0) revert QuoteInvalidAmount();
        escrow.amountIn = 0;

        _safeTransfer(escrow.token, to, amount);

        emit InventorySwept(quoteId, escrow.token, to, amount);
    }

    // ---------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------

    function escrowOf(bytes32 quoteId) external view returns (Escrow memory) {
        return _escrows[quoteId];
    }

    function isSettled(bytes32 quoteId) external view returns (bool) {
        Escrow storage escrow = _escrows[quoteId];
        return escrow.released || escrow.refunded;
    }

    function canRefund(bytes32 quoteId) external view returns (bool) {
        Escrow storage escrow = _escrows[quoteId];
        return
            escrow.depositor != address(0) &&
            !escrow.released &&
            !escrow.refunded &&
            block.timestamp > escrow.releaseDeadline;
    }
}
