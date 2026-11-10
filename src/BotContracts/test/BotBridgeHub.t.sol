// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BotBridgeHub } from "../bridge/BotBridgeHub.sol";
import { BotContractBase } from "../common/BotContractBase.sol";
import { MockERC20 } from "./utils/Mocks.sol";
import { TestBase } from "./utils/TestBase.sol";

/// @notice End-to-end tests for the Arbitrum-side bridge escrow.
contract BotBridgeHubTest is TestBase {
    BotBridgeHub internal hub;
    MockERC20 internal usdc;

    uint256 internal constant BROKER_KEY = 0xB0B;
    address internal broker;

    address internal owner = address(0xA11CE);
    address internal operator = address(0x0B0B);
    address internal trader = address(0x7BAD);
    address internal stranger = address(0xBAD0);

    uint256 internal constant BOT_CHAIN_ID = 677;
    uint64 internal constant WINDOW = 3600;
    uint256 internal constant AMOUNT = 25_000_000;
    uint256 internal constant MIN_OUT = 24_000_000;
    uint256 internal constant START = 1_800_000_000;
    bytes32 internal constant PAYOUT_REF = keccak256("bot-payout-1");

    function setUp() public {
        broker = vm.addr(BROKER_KEY);
        vm.warp(START);
        hub = new BotBridgeHub(owner, broker, operator, BOT_CHAIN_ID, WINDOW);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(trader, 1_000_000_000);
        vm.prank(trader);
        usdc.approve(address(hub), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers

    function _quote(uint256 amountIn, uint256 nonce)
        internal
        view
        returns (BotBridgeHub.BridgeQuote memory q)
    {
        q = BotBridgeHub.BridgeQuote({
            token: address(usdc),
            amountIn: amountIn,
            trader: trader,
            destChainId: BOT_CHAIN_ID,
            destToken: address(0xB07),
            destAccount: address(0xDEC0DE),
            minOut: MIN_OUT,
            feeBps: 75,
            expiresAt: block.timestamp + 600,
            nonce: nonce
        });
    }

    function _sign(address hubAddress, BotBridgeHub.BridgeQuote memory q, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, BotBridgeHub(hubAddress).quoteDigest(q));
        return abi.encodePacked(r, s, v);
    }

    function _deposit(BotBridgeHub.BridgeQuote memory q) internal returns (bytes32) {
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);
        vm.prank(trader);
        return hub.deposit(q, signature);
    }

    // ------------------------------------------------------------------ EIP-712

    function test_DomainSeparatorBindsChainAndAddress() public {
        bytes32 base = hub.domainSeparator();

        vm.chainId(999);
        assertTrue(hub.domainSeparator() != base, "domain does not bind chain id");

        BotBridgeHub other = new BotBridgeHub(owner, broker, operator, BOT_CHAIN_ID, WINDOW);
        assertTrue(other.domainSeparator() != base, "domain does not bind contract address");
    }

    function test_QuoteDigestMatchesStructHash() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 7);
        bytes32 id = hub.quoteIdOf(q);
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", hub.domainSeparator(), id));
        assertEq(hub.quoteDigest(q), expected, "digest is not hashTypedData(structHash)");
    }

    // ------------------------------------------------------------------ deposit

    function test_DepositLocksExactAmount() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);

        assertEq(id, hub.quoteIdOf(q), "returned id");
        assertEq(usdc.balanceOf(address(hub)), AMOUNT, "hub balance");
        assertEq(usdc.balanceOf(trader), 1_000_000_000 - AMOUNT, "trader balance");

        BotBridgeHub.Escrow memory e = hub.escrowOf(id);
        assertEq(e.depositor, trader, "depositor");
        assertEq(e.token, address(usdc), "token");
        assertEq(e.amountIn, AMOUNT, "amountIn");
        assertEq(e.destAccount, address(0xDEC0DE), "destAccount");
        assertEq(e.minOut, MIN_OUT, "minOut");
        assertEq(uint256(e.releaseDeadline), q.expiresAt + WINDOW, "releaseDeadline");
        assertFalse(e.released, "released");
        assertFalse(e.refunded, "refunded");
        assertFalse(hub.isSettled(id), "settled");
        assertFalse(hub.canRefund(id), "refundable before window");
    }

    function test_DepositAcceptsQuoteAtExpiryBoundary() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);
        vm.warp(q.expiresAt);

        vm.prank(trader);
        hub.deposit(q, signature);

        assertEq(hub.escrowOf(hub.quoteIdOf(q)).amountIn, AMOUNT, "not deposited");
    }

    function test_DepositRequiresTraderToBeCaller() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(BotBridgeHub.QuoteTraderMismatch.selector, trader, stranger)
        );
        hub.deposit(q, signature);
    }

    function test_DepositRejectsForgedBroker() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), q, 0xE1E);

        vm.prank(trader);
        vm.expectPartialRevert(BotContractBase.InvalidSigner.selector);
        hub.deposit(q, signature);
    }

    function test_DepositRejectsTamperedTerms() public {
        BotBridgeHub.BridgeQuote memory signedQuote = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), signedQuote, BROKER_KEY);

        BotBridgeHub.BridgeQuote memory submitted = signedQuote;
        submitted.destAccount = address(0xBADBAD);

        vm.prank(trader);
        vm.expectPartialRevert(BotContractBase.InvalidSigner.selector);
        hub.deposit(submitted, signature);
    }

    function test_DepositRejectsExpiredQuote() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);
        vm.warp(q.expiresAt + 1);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteExpired.selector, uint64(q.expiresAt)));
        hub.deposit(q, signature);
    }

    function test_DepositRejectsDuplicate() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.startPrank(trader);
        hub.deposit(q, signature);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteAlreadyUsed.selector, hub.quoteIdOf(q)));
        hub.deposit(q, signature);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(hub)), AMOUNT, "only one deposit");
    }

    function test_DepositRejectsReplayOnAnotherHub() public {
        BotBridgeHub other = new BotBridgeHub(owner, broker, operator, BOT_CHAIN_ID, WINDOW);
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(other), q, BROKER_KEY);

        vm.prank(trader);
        vm.expectPartialRevert(BotContractBase.InvalidSigner.selector);
        hub.deposit(q, signature);
    }

    function test_DepositRejectsSignatureFromAnotherChain() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.chainId(999);

        vm.prank(trader);
        vm.expectPartialRevert(BotContractBase.InvalidSigner.selector);
        hub.deposit(q, signature);
        assertEq(usdc.balanceOf(address(hub)), 0, "no funds taken");
    }

    function test_DepositRejectedWhilePaused() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.prank(owner);
        hub.pause();

        vm.prank(trader);
        vm.expectRevert(BotContractBase.ContractPaused.selector);
        hub.deposit(q, signature);
    }

    function test_DepositRejectsMalformedSignatures() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes memory good = _sign(address(hub), q, BROKER_KEY);

        bytes memory tooShort = new bytes(64);
        for (uint256 i = 0; i < 64; i++) tooShort[i] = good[i];
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.InvalidSignatureLength.selector, 64));
        hub.deposit(q, tooShort);

        bytes memory badV = new bytes(65);
        for (uint256 i = 0; i < 65; i++) badV[i] = good[i];
        badV[64] = bytes1(uint8(29));
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.InvalidSignatureV.selector, 29));
        hub.deposit(q, badV);

        bytes32 s;
        assembly {
            s := mload(add(good, 0x40))
        }
        uint256 curveOrder =
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(curveOrder - uint256(s));
        bytes memory malleated = new bytes(65);
        for (uint256 i = 0; i < 65; i++) malleated[i] = good[i];
        malleated[64] = bytes1(uint8(good[64]) == 27 ? 28 : 27);
        assembly {
            mstore(add(malleated, 0x40), highS)
        }
        vm.prank(trader);
        vm.expectPartialRevert(BotContractBase.InvalidSignatureS.selector);
        hub.deposit(q, malleated);
    }

    function test_DepositRejectsZeroTokenAndAmount() public {
        BotBridgeHub.BridgeQuote memory zeroToken = _quote(AMOUNT, 1);
        zeroToken.token = address(0);
        bytes memory signature = _sign(address(hub), zeroToken, BROKER_KEY);
        vm.prank(trader);
        vm.expectRevert(BotBridgeHub.QuoteInvalidToken.selector);
        hub.deposit(zeroToken, signature);

        BotBridgeHub.BridgeQuote memory zeroAmount = _quote(0, 1);
        bytes memory signature2 = _sign(address(hub), zeroAmount, BROKER_KEY);
        vm.prank(trader);
        vm.expectRevert(BotBridgeHub.QuoteInvalidAmount.selector);
        hub.deposit(zeroAmount, signature2);
    }

    function test_DepositRejectsWrongDestinationChain() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        q.destChainId = 1;
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteChainMismatch.selector, BOT_CHAIN_ID, 1));
        hub.deposit(q, signature);
    }

    function test_DepositRejectsZeroDestinationAccount() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        q.destAccount = address(0);
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(BotBridgeHub.QuoteDestinationZero.selector);
        hub.deposit(q, signature);
    }

    function test_DepositRejectsFeeAboveMaximum() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        q.feeBps = 10_001;
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.FeeOutOfRange.selector, 10_001));
        hub.deposit(q, signature);
    }

    function test_DepositRejectsExpiryBeyondUint64Window() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        q.expiresAt = uint256(type(uint64).max) - WINDOW + 1;
        bytes memory signature = _sign(address(hub), q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteExpiryTooFar.selector, q.expiresAt));
        hub.deposit(q, signature);
    }

    // ------------------------------------------------------------------ release

    function test_ReleaseRecordsPayout() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);

        vm.prank(operator);
        hub.release(id, PAYOUT_REF);

        BotBridgeHub.Escrow memory e = hub.escrowOf(id);
        assertTrue(e.released, "released");
        assertEq(e.botPayoutRef, PAYOUT_REF, "payout ref");
        assertTrue(hub.isSettled(id), "settled");
        assertFalse(hub.canRefund(id), "refundable");
        assertEq(usdc.balanceOf(address(hub)), AMOUNT, "inventory held for sweep");
    }

    function test_ReleaseOnlyOperator() public {
        bytes32 id = _deposit(_quote(AMOUNT, 1));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.NotOperator.selector, stranger));
        hub.release(id, PAYOUT_REF);
    }

    function test_ReleaseUnknownQuote() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteUnknown.selector, bytes32(uint256(1))));
        hub.release(bytes32(uint256(1)), PAYOUT_REF);
    }

    function test_ReleaseCannotRepeat() public {
        bytes32 id = _deposit(_quote(AMOUNT, 1));

        vm.startPrank(operator);
        hub.release(id, PAYOUT_REF);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteAlreadyReleased.selector, id));
        hub.release(id, keccak256("another"));
        vm.stopPrank();
    }

    function test_ReleaseRejectsZeroPayoutRef() public {
        bytes32 id = _deposit(_quote(AMOUNT, 1));

        vm.prank(operator);
        vm.expectRevert(BotBridgeHub.ZeroPayoutRef.selector);
        hub.release(id, bytes32(0));
    }

    function test_ReleaseCannotReusePayoutRef() public {
        bytes32 first = _deposit(_quote(AMOUNT, 1));
        bytes32 second = _deposit(_quote(AMOUNT, 2));

        vm.startPrank(operator);
        hub.release(first, PAYOUT_REF);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.PayoutRefReused.selector, PAYOUT_REF));
        hub.release(second, PAYOUT_REF);
        hub.release(second, keccak256("bot-payout-2"));
        vm.stopPrank();

        assertTrue(hub.escrowOf(second).released, "second still settleable with its own ref");
    }

    function test_ReleaseWindowClosesForOperator() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);
        uint256 deadline = q.expiresAt + WINDOW;

        // Exactly on the deadline the operator can still settle.
        vm.warp(deadline);
        vm.prank(operator);
        hub.release(id, PAYOUT_REF);

        // A later quote keeps its own window; one second past it, release is closed.
        BotBridgeHub.BridgeQuote memory q2 = _quote(AMOUNT, 2);
        bytes32 late = _deposit(q2);
        uint256 lateDeadline = q2.expiresAt + WINDOW;

        vm.warp(lateDeadline + 1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.ReleaseWindowClosed.selector, lateDeadline));
        hub.release(late, keccak256("bot-payout-late"));
    }

    function test_ReleaseBlockedWhilePaused() public {
        bytes32 id = _deposit(_quote(AMOUNT, 1));

        vm.prank(owner);
        hub.pause();

        vm.prank(operator);
        vm.expectRevert(BotContractBase.ContractPaused.selector);
        hub.release(id, PAYOUT_REF);

        vm.prank(owner);
        hub.unpause();
        vm.prank(operator);
        hub.release(id, PAYOUT_REF);
        assertTrue(hub.escrowOf(id).released, "released after unpause");
    }

    // ------------------------------------------------------------------ refund

    function test_RefundAfterWindowReturnsFunds() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);

        vm.warp(q.expiresAt + WINDOW + 1);
        assertTrue(hub.canRefund(id), "should be refundable");

        vm.prank(trader);
        hub.refund(id);

        assertEq(usdc.balanceOf(trader), 1_000_000_000, "full refund");
        assertEq(usdc.balanceOf(address(hub)), 0, "hub empty");
        assertEq(hub.escrowOf(id).amountIn, 0, "amount cleared");
        assertTrue(hub.escrowOf(id).refunded, "refunded");
        assertFalse(hub.canRefund(id), "not refundable twice");
    }

    function test_RefundRequiresWindowToClose() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);
        uint256 deadline = q.expiresAt + WINDOW;

        vm.warp(deadline);
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.ReleaseWindowClosed.selector, deadline));
        hub.refund(id);
    }

    function test_RefundRequiresDepositor() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);
        vm.warp(q.expiresAt + WINDOW + 1);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteTraderMismatch.selector, trader, stranger));
        hub.refund(id);
    }

    function test_RefundWorksWhilePaused() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);

        vm.prank(owner);
        hub.pause();
        vm.warp(q.expiresAt + WINDOW + 1);

        vm.prank(trader);
        hub.refund(id);
        assertEq(usdc.balanceOf(trader), 1_000_000_000, "pause must not trap funds");
    }

    function test_RefundImpossibleAfterRelease() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);

        vm.prank(operator);
        hub.release(id, PAYOUT_REF);
        vm.warp(q.expiresAt + WINDOW + 1);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteAlreadyReleased.selector, id));
        hub.refund(id);
    }

    function test_RefundUnknownQuote() public {
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteUnknown.selector, bytes32(uint256(9))));
        hub.refund(bytes32(uint256(9)));
    }

    // ------------------------------------------------------------------ treasury

    function test_SweepOnlyReleasedInventory() public {
        BotBridgeHub.BridgeQuote memory q = _quote(AMOUNT, 1);
        bytes32 id = _deposit(q);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(BotBridgeHub.QuoteNotReleased.selector, id));
        hub.sweepReleased(id, address(0xFEE1));

        vm.prank(operator);
        hub.release(id, PAYOUT_REF);

        vm.prank(owner);
        hub.sweepReleased(id, address(0xFEE1));
        assertEq(usdc.balanceOf(address(0xFEE1)), AMOUNT, "swept");
        assertEq(usdc.balanceOf(address(hub)), 0, "hub empty");

        vm.prank(owner);
        vm.expectRevert(BotBridgeHub.QuoteInvalidAmount.selector);
        hub.sweepReleased(id, address(0xFEE1));
    }

    function test_SweepCannotTouchUnsettledDeposit() public {
        bytes32 settled = _deposit(_quote(AMOUNT, 1));
        _deposit(_quote(AMOUNT, 2));

        vm.prank(operator);
        hub.release(settled, PAYOUT_REF);

        vm.prank(owner);
        hub.sweepReleased(settled, owner);
        assertEq(usdc.balanceOf(address(hub)), AMOUNT, "unsettled deposit untouched");
    }

    function test_SweepOwnerOnly() public {
        bytes32 id = _deposit(_quote(AMOUNT, 1));
        vm.prank(operator);
        hub.release(id, PAYOUT_REF);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.NotOwner.selector, stranger));
        hub.sweepReleased(id, stranger);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_DepositAndRefundAnyAmount(uint96 rawAmount) public {
        uint256 amount = _bound(uint256(rawAmount), 1, 1_000_000_000);
        BotBridgeHub.BridgeQuote memory q = _quote(amount, 1);
        bytes32 id = _deposit(q);

        assertEq(hub.escrowOf(id).amountIn, amount, "stored amount");
        assertEq(usdc.balanceOf(address(hub)), amount, "locked amount");

        vm.warp(q.expiresAt + WINDOW + 1);
        vm.prank(trader);
        hub.refund(id);

        assertEq(usdc.balanceOf(trader), 1_000_000_000, "fully returned");
        assertEq(usdc.balanceOf(address(hub)), 0, "hub empty");
    }

    function testFuzz_HubBalanceCoversOutstandingEscrows(uint96 rawA, uint96 rawB) public {
        uint256 amountA = _bound(uint256(rawA), 1, 500_000_000);
        uint256 amountB = _bound(uint256(rawB), 1, 500_000_000);

        BotBridgeHub.BridgeQuote memory qa = _quote(amountA, 1);
        BotBridgeHub.BridgeQuote memory qb = _quote(amountB, 2);
        bytes32 idA = _deposit(qa);
        bytes32 idB = _deposit(qb);

        vm.prank(operator);
        hub.release(idA, PAYOUT_REF);
        vm.warp(qb.expiresAt + WINDOW + 1);
        vm.prank(trader);
        hub.refund(idB);

        assertEq(usdc.balanceOf(address(hub)), amountA, "only released inventory remains");
        assertEq(hub.escrowOf(idB).amountIn, 0, "refunded escrow cleared");
    }
}
