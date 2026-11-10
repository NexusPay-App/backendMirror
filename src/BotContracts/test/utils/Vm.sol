// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Vm
/// @notice The subset of the HEVM cheatcode interface this suite uses.
/// @dev Vendored deliberately: like `IERC20` in `common/`, the folder must compile and test without
///      any package install. Mutating cheatcodes are declared without `view`/`pure` so solc emits a
///      regular CALL; `addr` and `sign` are declared `pure` because HEVM answers them under
///      STATICCALL.
interface Vm {
    function warp(uint256 newTimestamp) external;

    function roll(uint256 newHeight) external;

    function deal(address who, uint256 newBalance) external;

    function prank(address msgSender) external;

    function startPrank(address msgSender) external;

    function stopPrank() external;

    function chainId(uint256 newChainId) external;

    function expectRevert() external;

    function expectRevert(bytes4 revertData) external;

    /// @dev Selector-only match. `expectRevert(bytes4)` in Foundry 1.5 requires the full revert
    ///      data to equal the argument, so parameterised custom errors need this variant.
    function expectPartialRevert(bytes4 revertData) external;

    function expectRevert(bytes calldata revertData) external;

    function addr(uint256 privateKey) external pure returns (address);

    function sign(uint256 privateKey, bytes32 digest)
        external
        pure
        returns (uint8 v, bytes32 r, bytes32 s);
}
