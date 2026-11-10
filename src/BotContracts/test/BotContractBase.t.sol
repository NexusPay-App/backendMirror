// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BotContractBase } from "../common/BotContractBase.sol";
import { TestBase } from "./utils/TestBase.sol";

/// @dev Concrete shell so the internal signature helpers can be exercised directly.
contract BaseHarness is BotContractBase {
    constructor(address initialOwner) BotContractBase(initialOwner, "Harness") {}

    function recover(bytes32 digest, bytes calldata signature) external pure returns (address) {
        return _recover(digest, signature);
    }

    function requireSigner(bytes32 digest, bytes calldata signature, address expected) external pure {
        _requireSigner(digest, signature, expected);
    }

    function requireFeeBps(uint256 feeBps) external pure {
        _requireFeeBps(feeBps);
    }
}

/// @notice Tests for the shared primitives: EIP-712 domain, signature recovery, ownership, pause.
contract BotContractBaseTest is TestBase {
    uint256 internal constant KEY = 0x1234;
    address internal signer;
    address internal owner = address(0xA11CE);
    BaseHarness internal harness;

    function setUp() public {
        signer = vm.addr(KEY);
        harness = new BaseHarness(owner);
    }

    function test_DomainSeparatorUsesNameVersionChainAndAddress() public {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Harness")),
                keccak256(bytes("1")),
                block.chainid,
                address(harness)
            )
        );
        assertEq(harness.domainSeparator(), expected, "domain separator");
    }

    function test_RecoversRealSignature() public {
        bytes32 digest = keccak256("payload");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        assertEq(harness.recover(digest, signature), signer, "recovered signer");
        harness.requireSigner(digest, signature, signer);
    }

    function test_RejectsShortSignature() public {
        bytes memory signature = new bytes(64);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.InvalidSignatureLength.selector, 64));
        harness.recover(keccak256("payload"), signature);
    }

    function test_RejectsOutOfRangeV() public {
        bytes32 digest = keccak256("payload");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);
        signature[64] = bytes1(uint8(29));

        vm.expectRevert(abi.encodeWithSelector(BotContractBase.InvalidSignatureV.selector, 29));
        harness.recover(digest, signature);
    }

    function test_RejectsHighS() public {
        bytes32 digest = keccak256("payload");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        uint256 curveOrder = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(curveOrder - uint256(s));

        bytes memory signature = abi.encodePacked(r, s, v);
        signature[64] = bytes1(uint8(v) == 27 ? 28 : 27);
        assembly {
            mstore(add(signature, 0x40), highS)
        }

        vm.expectPartialRevert(BotContractBase.InvalidSignatureS.selector);
        harness.recover(digest, signature);
    }

    function test_RequireSignerRejectsWrongSigner() public {
        bytes32 digest = keccak256("payload");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectPartialRevert(BotContractBase.InvalidSigner.selector);
        harness.requireSigner(digest, signature, address(0xDEAD));
    }

    function test_RequireSignerRejectsZeroExpected() public {
        bytes32 digest = keccak256("payload");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.expectRevert(BotContractBase.ZeroAddress.selector);
        harness.requireSigner(digest, signature, address(0));
    }

    function test_FeeBound() public {
        harness.requireFeeBps(0);
        harness.requireFeeBps(10_000);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.FeeOutOfRange.selector, 10_001));
        harness.requireFeeBps(10_001);
    }

    function test_OwnershipIsTwoStep() public {
        assertEq(harness.owner(), owner, "owner");

        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.NotOwner.selector, address(0xBAD)));
        harness.transferOwnership(address(0xBAD));

        vm.prank(owner);
        harness.transferOwnership(address(0xBEEF));
        assertEq(harness.pendingOwner(), address(0xBEEF), "pending");
        assertEq(harness.owner(), owner, "owner unchanged until accepted");

        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.NotPendingOwner.selector, address(0xBAD)));
        harness.acceptOwnership();

        vm.prank(address(0xBEEF));
        harness.acceptOwnership();
        assertEq(harness.owner(), address(0xBEEF), "owner accepted");
        assertEq(harness.pendingOwner(), address(0), "pending cleared");
    }

    function test_TransferOwnershipRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(BotContractBase.ZeroAddress.selector);
        harness.transferOwnership(address(0));
    }

    function test_PauseOnlyOwner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.NotOwner.selector, address(0xBAD)));
        harness.pause();
        assertFalse(harness.paused(), "not paused");

        vm.prank(owner);
        harness.pause();
        assertTrue(harness.paused(), "paused");

        vm.prank(owner);
        harness.unpause();
        assertFalse(harness.paused(), "unpaused");
    }

    function test_ConstructorRejectsZeroOwner() public {
        vm.expectRevert(BotContractBase.ZeroAddress.selector);
        new BaseHarness(address(0));
    }
}
