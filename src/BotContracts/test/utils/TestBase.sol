// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Vm } from "./Vm.sol";

/// @title TestBase
/// @notice Assertions plus a deterministic bound helper. Forge discovers the `test*` functions of
///         every contract that inherits this.
abstract contract TestBase {
    // The canonical HEVM cheatcode address.
    Vm internal constant vm = Vm(address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D));

    function assertTrue(bool condition, string memory message) internal pure {
        require(condition, message);
    }

    function assertFalse(bool condition, string memory message) internal pure {
        require(!condition, message);
    }

    function assertEq(uint256 a, uint256 b, string memory message) internal pure {
        require(a == b, message);
    }

    function assertEq(address a, address b, string memory message) internal pure {
        require(a == b, message);
    }

    function assertEq(bytes32 a, bytes32 b, string memory message) internal pure {
        require(a == b, message);
    }


    function assertGt(uint256 a, uint256 b, string memory message) internal pure {
        require(a > b, message);
    }

    function assertGe(uint256 a, uint256 b, string memory message) internal pure {
        require(a >= b, message);
    }

    function assertLe(uint256 a, uint256 b, string memory message) internal pure {
        require(a <= b, message);
    }

    /// @dev Map an arbitrary fuzz input into `[min, max]` without reverting or shrinking coverage
    ///      to zero. Deterministic, so a failing case is reproducible from the fuzz seed.
    function _bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        if (x >= min && x <= max) return x;
        return min + (x % (max - min + 1));
    }
}
