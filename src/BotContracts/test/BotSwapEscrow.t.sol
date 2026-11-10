// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BotSwapEscrow } from "../swap/BotSwapEscrow.sol";
import { BotContractBase } from "../common/BotContractBase.sol";
import {
    MockERC20,
    MockERC20NoReturn,
    MockERC20FalseReturn,
    MockFeeToken,
    MockReentrantToken,
    ReentrantTrader
} from "./utils/Mocks.sol";
import { TestBase } from "./utils/TestBase.sol";

/// @notice End-to-end tests for the BOT Chain OTC swap escrow, both directions.
contract BotSwapEscrowTest is TestBase {
    BotSwapEscrow internal escrow;
    MockERC20 internal usdt;

    uint256 internal constant BROKER_KEY = 0xB0B;
    address internal broker;

    address internal owner = address(0xA11CE);
    address internal trader = address(0x7BAD);
    address internal treasury = address(0xFEE1);
    address internal stranger = address(0xBAD0);

    uint256 internal constant START = 1_800_000_000;
    uint256 internal constant USDT_OUT = 24_000_000;
    uint256 internal constant NATIVE_OUT = 10_000_000_000_000_000; // 0.01 BOT

    function setUp() public {
        broker = vm.addr(BROKER_KEY);
        vm.warp(START);
        escrow = new BotSwapEscrow(owner, broker);
        usdt = new MockERC20("Tether USD", "USDT", 6);
        usdt.mint(trader, 1_000_000_000);
        usdt.mint(address(escrow), 1_000_000_000);
        vm.deal(address(escrow), 10 ether);
        vm.deal(address(this), 10 ether);
        vm.deal(trader, 10 ether);
        vm.prank(trader);
        usdt.approve(address(escrow), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers

    function _sellQuote(uint256 amountIn, uint256 amountOut, uint256 nonce)
        internal
        view
        returns (BotSwapEscrow.SwapQuote memory q)
    {
        q = BotSwapEscrow.SwapQuote({
            tokenIn: address(usdt),
            amountIn: amountIn,
            tokenOut: address(0),
            amountOut: amountOut,
            trader: trader,
            recipient: trader,
            minOut: amountOut,
            feeBps: 50,
            expiresAt: block.timestamp + 600,
            nonce: nonce
        });
    }

    function _buyQuote(uint256 amountIn, uint256 amountOut, uint256 nonce)
        internal
        view
        returns (BotSwapEscrow.SwapQuote memory q)
    {
        q = BotSwapEscrow.SwapQuote({
            tokenIn: address(0),
            amountIn: amountIn,
            tokenOut: address(usdt),
            amountOut: amountOut,
            trader: trader,
            recipient: trader,
            minOut: amountOut,
            feeBps: 50,
            expiresAt: block.timestamp + 600,
            nonce: nonce
        });
    }

    function _sign(BotSwapEscrow.SwapQuote memory q, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, escrow.quoteDigest(q));
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------ happy paths

    function test_SellUsdtForNative() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 1);
        bytes memory signature = _sign(q, BROKER_KEY);
        uint256 ethBefore = trader.balance;
        uint256 usdtBefore = usdt.balanceOf(trader);

        vm.prank(trader);
        bytes32 id = escrow.swap(q, signature);

        assertEq(id, escrow.quoteIdOf(q), "quote id");
        assertEq(usdt.balanceOf(trader), usdtBefore - q.amountIn, "usdt in");
        assertEq(trader.balance, ethBefore + q.amountOut, "native out");
        assertEq(usdt.balanceOf(address(escrow)), 1_000_000_000 + q.amountIn, "usdt inventory up");
        assertEq(address(escrow).balance, 10 ether - q.amountOut, "native inventory down");
        assertTrue(escrow.isQuoteUsed(id), "quote marked used");
    }

    function test_BuyUsdtWithNative() public {
        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, USDT_OUT, 2);
        bytes memory signature = _sign(q, BROKER_KEY);
        uint256 ethBefore = trader.balance;
        uint256 usdtBefore = usdt.balanceOf(trader);

        vm.prank(trader);
        escrow.swap{ value: q.amountIn }(q, signature);

        assertEq(trader.balance, ethBefore - q.amountIn, "native in");
        assertEq(usdt.balanceOf(trader), usdtBefore + q.amountOut, "usdt out");
        assertEq(usdt.balanceOf(address(escrow)), 1_000_000_000 - q.amountOut, "inventory down");
    }

    function test_SwapEmitsAndReturnsStableId() public {
        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, USDT_OUT, 3);
        bytes memory signature = _sign(q, BROKER_KEY);

        bytes32 expected = escrow.quoteIdOf(q);
        vm.prank(trader);
        bytes32 actual = escrow.swap{ value: q.amountIn }(q, signature);
        assertEq(actual, expected, "id must equal struct hash");
        assertEq(escrow.quoteDigest(q), keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), expected)), "digest");
    }

    // ------------------------------------------------------------------ replay and expiry

    function test_ReplayRejected() public {
        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, USDT_OUT, 4);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.startPrank(trader);
        escrow.swap{ value: q.amountIn }(q, signature);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.QuoteAlreadyUsed.selector, escrow.quoteIdOf(q)));
        escrow.swap{ value: q.amountIn }(q, signature);
        vm.stopPrank();

        assertEq(usdt.balanceOf(trader), 1_000_000_000 + USDT_OUT, "paid exactly once");
    }

    function test_ExpiredQuoteRejected() public {
        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, USDT_OUT, 5);
        bytes memory signature = _sign(q, BROKER_KEY);
        vm.warp(q.expiresAt + 1);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.QuoteExpired.selector, q.expiresAt));
        escrow.swap{ value: q.amountIn }(q, signature);
    }

    function test_WrongSignerRejected() public {
        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, USDT_OUT, 6);
        bytes memory signature = _sign(q, 0xE1E);

        vm.prank(trader);
        vm.expectPartialRevert(BotContractBase.InvalidSigner.selector);
        escrow.swap{ value: q.amountIn }(q, signature);
    }

    function test_TamperedAmountRejected() public {
        BotSwapEscrow.SwapQuote memory signedQuote = _buyQuote(1 ether, USDT_OUT, 7);
        bytes memory signature = _sign(signedQuote, BROKER_KEY);

        BotSwapEscrow.SwapQuote memory submitted = signedQuote;
        submitted.amountOut = 999_000_000;

        vm.prank(trader);
        vm.expectPartialRevert(BotContractBase.InvalidSigner.selector);
        escrow.swap{ value: submitted.amountIn }(submitted, signature);
    }

    // ------------------------------------------------------------------ validation

    function test_NativeValueMustMatchExactly() public {
        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, USDT_OUT, 8);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.NativeValueMismatch.selector, q.amountIn, q.amountIn - 1));
        escrow.swap{ value: q.amountIn - 1 }(q, signature);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.NativeValueMismatch.selector, q.amountIn, q.amountIn + 1));
        escrow.swap{ value: q.amountIn + 1 }(q, signature);
    }

    function test_Erc20QuoteRejectsNativeValue() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 9);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.UnexpectedNativeValue.selector, 1));
        escrow.swap{ value: 1 }(q, signature);
    }

    function test_SameTokenRejected() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 10);
        q.tokenOut = address(usdt);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(BotSwapEscrow.QuoteSameToken.selector);
        escrow.swap(q, signature);
    }

    function test_ZeroAmountsRejected() public {
        BotSwapEscrow.SwapQuote memory zeroIn = _sellQuote(0, NATIVE_OUT, 11);
        bytes memory signature = _sign(zeroIn, BROKER_KEY);
        vm.prank(trader);
        vm.expectRevert(BotSwapEscrow.QuoteInvalidAmount.selector);
        escrow.swap(zeroIn, signature);

        BotSwapEscrow.SwapQuote memory zeroOut = _sellQuote(25_000_000, 0, 12);
        bytes memory signature2 = _sign(zeroOut, BROKER_KEY);
        vm.prank(trader);
        vm.expectRevert(BotSwapEscrow.QuoteInvalidAmount.selector);
        escrow.swap(zeroOut, signature2);
    }

    function test_TraderMustBeCaller() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 13);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.QuoteTraderMismatch.selector, trader, stranger));
        escrow.swap(q, signature);
    }

    function test_RecipientMustBeTrader() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 14);
        q.recipient = stranger;
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.QuoteRecipientMismatch.selector, stranger, trader));
        escrow.swap(q, signature);
    }

    function test_AmountOutBelowMinOutRejected() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 15);
        q.minOut = NATIVE_OUT + 1;
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotSwapEscrow.QuoteBelowMinOut.selector, NATIVE_OUT, NATIVE_OUT + 1));
        escrow.swap(q, signature);
    }

    function test_FeeAboveMaximumRejected() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 16);
        q.feeBps = 10_001;
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.FeeOutOfRange.selector, 10_001));
        escrow.swap(q, signature);
    }

    function test_PausedBlocksSwaps() public {
        BotSwapEscrow.SwapQuote memory q = _sellQuote(25_000_000, NATIVE_OUT, 17);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(owner);
        escrow.pause();

        vm.prank(trader);
        vm.expectRevert(BotContractBase.ContractPaused.selector);
        escrow.swap(q, signature);
    }

    // ------------------------------------------------------------------ inventory

    function test_InsufficientInventoryBlocked() public {
        BotSwapEscrow.SwapQuote memory erc20 = _buyQuote(1 ether, 1_000_000_000, 18);
        erc20.amountOut = 1_000_000_001;
        erc20.minOut = erc20.amountOut;
        bytes memory signature = _sign(erc20, BROKER_KEY);
        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(BotSwapEscrow.InsufficientInventory.selector, address(usdt), 1_000_000_000, 1_000_000_001)
        );
        escrow.swap{ value: erc20.amountIn }(erc20, signature);

        BotSwapEscrow.SwapQuote memory native = _sellQuote(25_000_000, 11 ether, 19);
        bytes memory signature2 = _sign(native, BROKER_KEY);
        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(BotSwapEscrow.InsufficientInventory.selector, address(0), 10 ether, 11 ether)
        );
        escrow.swap(native, signature2);
    }

    function test_WithdrawInventory() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BotContractBase.NotOwner.selector, stranger));
        escrow.withdrawInventory(address(usdt), treasury, 1);

        vm.prank(owner);
        escrow.withdrawInventory(address(usdt), treasury, 100_000_000);
        assertEq(usdt.balanceOf(treasury), 100_000_000, "erc20 out");

        vm.prank(owner);
        escrow.withdrawInventory(address(0), treasury, 1 ether);
        assertEq(treasury.balance, 1 ether, "native out");

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                BotSwapEscrow.InsufficientInventory.selector,
                address(usdt),
                900_000_000,
                900_000_001
            )
        );
        escrow.withdrawInventory(address(usdt), treasury, 900_000_001);

        vm.prank(owner);
        vm.expectRevert(BotSwapEscrow.QuoteInvalidAmount.selector);
        escrow.withdrawInventory(address(usdt), treasury, 0);
    }

    // ------------------------------------------------------------------ token behaviour

    function test_NoReturnTokenSettles() public {
        MockERC20NoReturn token = new MockERC20NoReturn("Tether USD", "USDT", 6);
        token.mint(address(escrow), 1_000_000_000);
        token.mint(trader, 100_000_000);
        vm.prank(trader);
        token.approve(address(escrow), type(uint256).max);

        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, 10_000_000, 20);
        q.tokenOut = address(token);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        escrow.swap{ value: q.amountIn }(q, signature);
        assertEq(token.balanceOf(trader), 110_000_000, "no-return token paid out");
    }

    function test_FalseReturnTokenFailsClosed() public {
        MockERC20FalseReturn token = new MockERC20FalseReturn();
        token.mint(address(escrow), 1_000_000_000);

        BotSwapEscrow.SwapQuote memory q = _buyQuote(1 ether, 10_000_000, 21);
        q.tokenOut = address(token);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        vm.expectRevert(
            abi.encodeWithSelector(
                BotContractBase.TokenTransferFailed.selector,
                address(token),
                address(escrow),
                trader,
                q.amountOut
            )
        );
        escrow.swap{ value: q.amountIn }(q, signature);
    }

    function test_FeeOnTransferInputIsAccountedHonestly() public {
        MockFeeToken token = new MockFeeToken();
        token.mint(trader, 10 ether);
        vm.prank(trader);
        token.approve(address(escrow), type(uint256).max);

        BotSwapEscrow.SwapQuote memory q = _sellQuote(1 ether, NATIVE_OUT, 22);
        q.tokenIn = address(token);
        bytes memory signature = _sign(q, BROKER_KEY);

        vm.prank(trader);
        escrow.swap(q, signature);

        assertEq(token.balanceOf(address(escrow)), 0.99 ether, "credited net received");
    }

    // ------------------------------------------------------------------ reentrancy

    function test_ReentrancyOnInputPullBlocked() public {
        MockReentrantToken token = new MockReentrantToken();
        token.mint(trader, 100_000_000);
        vm.prank(trader);
        token.approve(address(escrow), type(uint256).max);

        BotSwapEscrow.SwapQuote memory q = _sellQuote(50_000_000, NATIVE_OUT, 23);
        q.tokenIn = address(token);
        bytes memory signature = _sign(q, BROKER_KEY);

        token.arm(address(escrow), abi.encodeCall(BotSwapEscrow.swap, (q, signature)));

        vm.prank(trader);
        escrow.swap(q, signature);

        assertTrue(token.attempted(), "callback attempted");
        assertFalse(token.callbackOk(), "reentrant call must fail");
        assertEq(
            bytes32(token.lastRevert()),
            bytes32(BotContractBase.Reentrancy.selector),
            "guard error"
        );
        assertEq(token.balanceOf(address(escrow)), 50_000_000, "single settlement");
    }

    function test_ReentrancyOnNativePayoutBlocked() public {
        ReentrantTrader user = new ReentrantTrader();
        usdt.mint(address(user), 100_000_000);
        user.approveToken(address(usdt), address(escrow), type(uint256).max);

        BotSwapEscrow.SwapQuote memory q = _sellQuote(50_000_000, NATIVE_OUT, 24);
        q.trader = address(user);
        q.recipient = address(user);
        bytes memory signature = _sign(q, BROKER_KEY);

        bytes memory payload = abi.encodeCall(BotSwapEscrow.swap, (q, signature));
        user.arm(address(escrow), payload);
        user.execute(address(escrow), payload);

        assertTrue(user.attempted(), "payout callback attempted");
        assertFalse(user.callbackOk(), "reentrant payout call must fail");
        assertEq(
            bytes32(user.lastRevert()),
            bytes32(BotContractBase.Reentrancy.selector),
            "guard error"
        );
        assertEq(address(user).balance, NATIVE_OUT, "payout still delivered");
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_NativeSwapConservesValue(uint96 rawAmountIn) public {
        uint256 amountIn = _bound(uint256(rawAmountIn), 1, 5 ether);
        BotSwapEscrow.SwapQuote memory q = _buyQuote(amountIn, 1_000_000, 25);
        bytes memory signature = _sign(q, BROKER_KEY);
        uint256 totalBefore = trader.balance + address(escrow).balance;

        vm.prank(trader);
        escrow.swap{ value: q.amountIn }(q, signature);

        assertEq(trader.balance + address(escrow).balance, totalBefore, "value conserved");
    }

    function testFuzz_UsdtToNativeConservesBothSides(uint96 rawAmountIn) public {
        uint256 amountIn = _bound(uint256(rawAmountIn), 1, 1_000_000_000);
        BotSwapEscrow.SwapQuote memory q = _sellQuote(amountIn, NATIVE_OUT, 26);
        bytes memory signature = _sign(q, BROKER_KEY);
        uint256 usdtBefore = usdt.balanceOf(trader) + usdt.balanceOf(address(escrow));

        vm.prank(trader);
        escrow.swap(q, signature);

        assertEq(
            usdt.balanceOf(trader) + usdt.balanceOf(address(escrow)),
            usdtBefore,
            "usdt conserved"
        );
    }
}
