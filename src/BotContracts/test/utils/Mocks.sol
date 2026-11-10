// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockERC20
/// @notice Plain, well-behaved ERC-20 with open minting.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external virtual {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external virtual returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external virtual returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "MockERC20: allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal virtual {
        require(to != address(0), "MockERC20: zero recipient");
        require(balanceOf[from] >= amount, "MockERC20: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @title MockERC20NoReturn
/// @notice USDT-style token: `transfer` / `transferFrom` / `approve` return nothing.
contract MockERC20NoReturn {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockERC20NoReturn: allowance");
        allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "MockERC20NoReturn: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @title MockERC20FalseReturn
/// @notice Moves balances but reports failure, the way a broken token can.
contract MockERC20FalseReturn is MockERC20 {
    constructor() MockERC20("False Return", "FALSE", 18) {}

    function transfer(address to, uint256 amount) external override returns (bool) {
        _move(msg.sender, to, amount);
        return false;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        _move(from, to, amount);
        return false;
    }
}

/// @title MockFeeToken
/// @notice Burns 1% of every movement, so the recipient receives less than the sent amount.
contract MockFeeToken is MockERC20 {
    constructor() MockERC20("Fee Token", "FEE", 18) {}

    function _move(address from, address to, uint256 amount) internal override {
        require(balanceOf[from] >= amount, "MockFeeToken: balance");
        uint256 fee = amount / 100;
        uint256 received = amount - fee;
        balanceOf[from] -= amount;
        balanceOf[to] += received;
        totalSupply -= fee;
        emit Transfer(from, to, received);
    }
}

/// @title MockReentrantToken
/// @notice Calls back into an armed target on every movement, recording whether the callback
///         succeeded and which error it reverted with. It deliberately does not bubble the failure,
///         so a test can assert on the guard instead of only seeing the outer revert.
contract MockReentrantToken is MockERC20 {
    address public target;
    bytes public payload;
    bool public attempted;
    bool public callbackOk;
    bytes4 public lastRevert;

    constructor() MockERC20("Reentrant", "RE", 18) {}

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function _move(address from, address to, uint256 amount) internal override {
        super._move(from, to, amount);
        if (target != address(0) && payload.length != 0) {
            attempted = true;
            (bool ok, bytes memory ret) = target.call(payload);
            callbackOk = ok;
            if (!ok && ret.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(ret, 32))
                }
                lastRevert = selector;
            }
        }
    }
}

/// @title ReentrantTrader
/// @notice A user that reenters on native payout. Stands in for a smart-contract wallet.
contract ReentrantTrader {
    address public target;
    bytes public payload;
    bool public attempted;
    bool public callbackOk;
    bytes4 public lastRevert;

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function approveToken(address token, address spender, uint256 amount) external {
        (bool ok, ) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        require(ok, "ReentrantTrader: approve");
    }

    function execute(address target_, bytes calldata data) external payable {
        (bool ok, ) = target_.call{ value: msg.value }(data);
        require(ok, "ReentrantTrader: execute");
    }

    receive() external payable {
        if (target != address(0) && payload.length != 0) {
            attempted = true;
            (bool ok, bytes memory ret) = target.call(payload);
            callbackOk = ok;
            if (!ok && ret.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(ret, 32))
                }
                lastRevert = selector;
            }
        }
    }
}
