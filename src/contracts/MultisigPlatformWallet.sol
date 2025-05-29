// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title MultisigPlatformWallet
 * @dev A 2-of-3 multisig wallet for platform operations with recovery capabilities
 */
contract MultisigPlatformWallet is ReentrancyGuard {
    using ECDSA for bytes32;

    // Events
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TransactionQueued(bytes32 indexed txHash, address indexed to, uint256 value, bytes data);
    event TransactionConfirmed(bytes32 indexed txHash, address indexed signer);
    event TransactionExecuted(bytes32 indexed txHash, address indexed to, uint256 value);
    event RecoveryInitiated(address indexed newOwner, bytes32 indexed recoveryHash);
    event RecoveryConfirmed(address indexed signer, bytes32 indexed recoveryHash);
    event RecoveryExecuted(address indexed oldOwner, address indexed newOwner);

    // State variables
    address[3] public owners;
    mapping(bytes32 => bool) public executed;
    mapping(bytes32 => mapping(address => bool)) public confirmations;
    mapping(bytes32 => Transaction) public transactions;
    mapping(bytes32 => Recovery) public recoveries;
    uint256 public constant CONFIRMATION_THRESHOLD = 2;
    uint256 public nonce;

    // Structs
    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 numConfirmations;
    }

    struct Recovery {
        address newOwner;
        uint256 numConfirmations;
        bool executed;
    }

    // Modifiers
    modifier onlyOwner() {
        bool isOwner = false;
        for (uint i = 0; i < owners.length; i++) {
            if (msg.sender == owners[i]) {
                isOwner = true;
                break;
            }
        }
        require(isOwner, "Not an owner");
        _;
    }

    modifier txExists(bytes32 txHash) {
        require(transactions[txHash].to != address(0), "Transaction does not exist");
        _;
    }

    modifier notExecuted(bytes32 txHash) {
        require(!transactions[txHash].executed, "Transaction already executed");
        _;
    }

    modifier recoveryExists(bytes32 recoveryHash) {
        require(recoveries[recoveryHash].newOwner != address(0), "Recovery does not exist");
        _;
    }

    modifier notRecoveryExecuted(bytes32 recoveryHash) {
        require(!recoveries[recoveryHash].executed, "Recovery already executed");
        _;
    }

    /**
     * @dev Constructor to set up the initial owners
     * @param _owners Array of 3 owner addresses
     */
    constructor(address[3] memory _owners) {
        require(_owners[0] != address(0) && _owners[1] != address(0) && _owners[2] != address(0), "Invalid owner");
        require(_owners[0] != _owners[1] && _owners[1] != _owners[2] && _owners[0] != _owners[2], "Duplicate owner");
        
        owners = _owners;
    }

    /**
     * @dev Queue a new transaction for confirmation
     * @param to Recipient address
     * @param value Amount of ETH to send
     * @param data Transaction data (for contract interactions)
     * @return txHash Hash of the queued transaction
     */
    function queueTransaction(
        address to,
        uint256 value,
        bytes memory data
    ) public onlyOwner returns (bytes32) {
        require(to != address(0), "Invalid recipient");

        bytes32 txHash = keccak256(
            abi.encodePacked(to, value, data, nonce)
        );
        nonce++;

        transactions[txHash] = Transaction({
            to: to,
            value: value,
            data: data,
            executed: false,
            numConfirmations: 0
        });

        emit TransactionQueued(txHash, to, value, data);
        return txHash;
    }

    /**
     * @dev Confirm a queued transaction
     * @param txHash Hash of the transaction to confirm
     */
    function confirmTransaction(bytes32 txHash)
        public
        onlyOwner
        txExists(txHash)
        notExecuted(txHash)
    {
        Transaction storage transaction = transactions[txHash];
        require(!confirmations[txHash][msg.sender], "Already confirmed");

        confirmations[txHash][msg.sender] = true;
        transaction.numConfirmations++;

        emit TransactionConfirmed(txHash, msg.sender);

        if (transaction.numConfirmations >= CONFIRMATION_THRESHOLD) {
            executeTransaction(txHash);
        }
    }

    /**
     * @dev Execute a transaction that has enough confirmations
     * @param txHash Hash of the transaction to execute
     */
    function executeTransaction(bytes32 txHash)
        internal
        txExists(txHash)
        notExecuted(txHash)
        nonReentrant
    {
        Transaction storage transaction = transactions[txHash];
        require(
            transaction.numConfirmations >= CONFIRMATION_THRESHOLD,
            "Not enough confirmations"
        );

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );
        require(success, "Transaction failed");

        emit TransactionExecuted(txHash, transaction.to, transaction.value);
    }

    /**
     * @dev Initiate a recovery process to change an owner
     * @param newOwner Address of the new owner
     * @return recoveryHash Hash of the recovery request
     */
    function initiateRecovery(address newOwner) public onlyOwner returns (bytes32) {
        require(newOwner != address(0), "Invalid new owner");
        
        bytes32 recoveryHash = keccak256(
            abi.encodePacked(newOwner, nonce)
        );
        nonce++;

        recoveries[recoveryHash] = Recovery({
            newOwner: newOwner,
            numConfirmations: 0,
            executed: false
        });

        emit RecoveryInitiated(newOwner, recoveryHash);
        return recoveryHash;
    }

    /**
     * @dev Confirm a recovery request
     * @param recoveryHash Hash of the recovery to confirm
     */
    function confirmRecovery(bytes32 recoveryHash)
        public
        onlyOwner
        recoveryExists(recoveryHash)
        notRecoveryExecuted(recoveryHash)
    {
        Recovery storage recovery = recoveries[recoveryHash];
        require(!confirmations[recoveryHash][msg.sender], "Already confirmed");

        confirmations[recoveryHash][msg.sender] = true;
        recovery.numConfirmations++;

        emit RecoveryConfirmed(msg.sender, recoveryHash);

        if (recovery.numConfirmations >= CONFIRMATION_THRESHOLD) {
            executeRecovery(recoveryHash);
        }
    }

    /**
     * @dev Execute a recovery that has enough confirmations
     * @param recoveryHash Hash of the recovery to execute
     */
    function executeRecovery(bytes32 recoveryHash)
        internal
        recoveryExists(recoveryHash)
        notRecoveryExecuted(recoveryHash)
    {
        Recovery storage recovery = recoveries[recoveryHash];
        require(
            recovery.numConfirmations >= CONFIRMATION_THRESHOLD,
            "Not enough confirmations"
        );

        recovery.executed = true;

        // Find the oldest confirmation and replace that owner
        address oldestConfirmer = address(0);
        uint256 oldestIndex = 0;
        
        for (uint i = 0; i < owners.length; i++) {
            if (confirmations[recoveryHash][owners[i]]) {
                oldestConfirmer = owners[i];
                oldestIndex = i;
                break;
            }
        }

        require(oldestConfirmer != address(0), "No confirmer found");
        
        address oldOwner = owners[oldestIndex];
        owners[oldestIndex] = recovery.newOwner;

        emit RecoveryExecuted(oldOwner, recovery.newOwner);
    }

    /**
     * @dev Get all current owners
     * @return Array of owner addresses
     */
    function getOwners() public view returns (address[3] memory) {
        return owners;
    }

    /**
     * @dev Check if an address is an owner
     * @param account Address to check
     * @return bool True if the address is an owner
     */
    function isOwner(address account) public view returns (bool) {
        for (uint i = 0; i < owners.length; i++) {
            if (account == owners[i]) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Get transaction details
     * @param txHash Hash of the transaction
     * @return to Recipient address
     * @return value Transaction value
     * @return data Transaction data
     * @return executed Whether the transaction was executed
     * @return numConfirmations Number of confirmations
     */
    function getTransaction(bytes32 txHash)
        public
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations
        )
    {
        Transaction storage transaction = transactions[txHash];
        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numConfirmations
        );
    }

    // Receive function to accept ETH
    receive() external payable {}
} 