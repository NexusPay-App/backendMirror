// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "./IERC20.sol";

/// @title BotContractBase
/// @notice Shared, audited-once primitives for the BotContracts protocol contracts.
/// @dev Deliberately small: two-step ownership, pause, reentrancy guard, EIP-712 domain and
///      digest helpers, low-s ECDSA recovery, and checked token/native transfers.
///
///      Design rules encoded here:
///      - EIP-712 domain is recomputed on read from `block.chainid`, so a forked chain cannot
///        replay a signature signed for another chain id.
///      - Ownership is two-step: a typo in `transferOwnership` cannot brick the contract.
///      - Every external token interaction is checked, both the call result and the return value,
///        so a non-standard ERC-20 that returns nothing or reverts on a silent failure is caught.
///      - `nonReentrant` is independent of `paused` so an owner can pause without blocking refunds.
abstract contract BotContractBase {
    // ---------------------------------------------------------------------------
    // EIP-712
    // ---------------------------------------------------------------------------

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal constant EIP712_VERSION_HASH = keccak256(bytes("1"));

    /// @dev secp256k1n / 2. Signatures with s above this are malleable and rejected.
    uint256 private constant _SECP256K1N_DIV_2 =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    bytes32 private immutable _hashedName;

    // ---------------------------------------------------------------------------
    // Ownership and pause
    // ---------------------------------------------------------------------------

    address public owner;
    address public pendingOwner;
    bool public paused;

    // ---------------------------------------------------------------------------
    // Reentrancy
    // ---------------------------------------------------------------------------

    bool private _locked;

    /// @dev Absolute sanity bound for signed `feeBps` fields. The broker is trusted to price, but
    ///      a buggy signer emitting 20000 bps would otherwise put a nonsense value in the on-chain
    ///      audit record and in `SwapExecuted` / `BridgeDeposit`.
    uint256 internal constant MAX_FEE_BPS = 10_000;

    // ---------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------

    error NotOwner(address caller);
    error NotPendingOwner(address caller);
    error ZeroAddress();
    error ContractPaused();
    error Reentrancy();
    error NotContract(address target);
    error TokenTransferFailed(address token, address from, address to, uint256 amount);
    error NativeTransferFailed(address to, uint256 amount);
    error InvalidSignatureLength(uint256 length);
    error InvalidSignatureS(bytes32 s);
    error InvalidSignatureV(uint8 v);
    error InvalidSigner(address expected, address recovered);
    error FeeOutOfRange(uint256 feeBps);

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    // ---------------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------------

    constructor(address initialOwner, string memory domainName) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        _hashedName = keccak256(bytes(domainName));
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ---------------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    // ---------------------------------------------------------------------------
    // Ownership
    // ---------------------------------------------------------------------------

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert ZeroAddress();
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(owner, nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner(msg.sender);
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    // ---------------------------------------------------------------------------
    // Pause
    // ---------------------------------------------------------------------------

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ---------------------------------------------------------------------------
    // EIP-712 helpers
    // ---------------------------------------------------------------------------

    /// @notice The EIP-712 domain separator for this contract on the current chain.
    function domainSeparator() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    _hashedName,
                    EIP712_VERSION_HASH,
                    block.chainid,
                    address(this)
                )
            );
    }

    /// @notice The digest a broker signature must be produced over.
    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @notice Recover the signer of `digest`, rejecting malleable and malformed signatures.
    function _recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignatureLength(signature.length);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignatureV(v);
        if (uint256(s) > _SECP256K1N_DIV_2) revert InvalidSignatureS(s);

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSigner(address(0), recovered);
        return recovered;
    }

    /// @notice Verify a signature was produced by `expected` over `digest`.
    function _requireSigner(bytes32 digest, bytes memory signature, address expected) internal pure {
        if (expected == address(0)) revert ZeroAddress();
        address recovered = _recover(digest, signature);
        if (recovered != expected) revert InvalidSigner(expected, recovered);
    }

    /// @notice Revert when a signed fee is outside the sane range.
    function _requireFeeBps(uint256 feeBps) internal pure {
        if (feeBps > MAX_FEE_BPS) revert FeeOutOfRange(feeBps);
    }

    // ---------------------------------------------------------------------------
    // Transfer helpers
    // ---------------------------------------------------------------------------

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        if (token.code.length == 0) revert NotContract(token);
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!ok) revert TokenTransferFailed(token, from, to, amount);
        if (data.length != 0 && !abi.decode(data, (bool))) {
            revert TokenTransferFailed(token, from, to, amount);
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (token.code.length == 0) revert NotContract(token);
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok) revert TokenTransferFailed(token, address(this), to, amount);
        if (data.length != 0 && !abi.decode(data, (bool))) {
            revert TokenTransferFailed(token, address(this), to, amount);
        }
    }

    function _safeTransferNative(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{ value: amount }("");
        if (!ok) revert NativeTransferFailed(to, amount);
    }

    function _balanceOf(address token) internal view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        return IERC20(token).balanceOf(address(this));
    }
}
