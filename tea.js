const Web3 = require('web3');
const { randomInt } = require('crypto');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Dynamically import chalk
let chalk;
(async () => {
    const chalkModule = await import('chalk');
    chalk = chalkModule.default || chalkModule; // Ensure compatibility with environments
})();

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

// Counter for successful transactions per worker
const workerSuccessCounts = new Map();

// Function to log and reset the success counters every 12 hours
async function resetSuccessCounters(totalTransactionsMap) {
    console.log(chalk.blue(`\n>>> Total successful transactions in the last 12 hours <<<`));
    for (const [workerIndex, count] of workerSuccessCounts.entries()) {
        const maxTransactions = totalTransactionsMap.get(workerIndex) || 0;
        const adjustedCount = Math.min(count, maxTransactions); // Ensure count does not exceed maxTransactions
        console.log(chalk.blue(`Worker ${workerIndex}: ${adjustedCount} successful transactions`));
    }
    workerSuccessCounts.clear(); // Reset all counters atomically
    setTimeout(() => resetSuccessCounters(totalTransactionsMap), 12 * 60 * 60 * 1000); // Schedule the next reset
}

// Convert decimal amount to integer based on decimals (default 18)
function intToDecimal(amount, decimals = 18) {
    return BigInt(Math.floor(amount * 10 ** decimals)); // Ensure BigInt is used correctly
}

// Generate a random decimal between min and max with specified precision
function randomDecimal(min, max, decimals = 8) {
    const scale = 10 ** decimals;
    const minInt = Math.floor(min * scale);
    const maxInt = Math.floor(max * scale);
    const randomIntValue = randomInt(minInt, maxInt + 1);
    return randomIntValue / scale;
}

// Transfer TEA tokens
async function transferTea({
    privateKey,
    amountToTransfer,
    toAddress,
    chainId = 10218,
    scan = "https://sepolia.tea.xyz/tx",
    rpcChain = "https://tea-sepolia.g.alchemy.com/public",
    symbol = "TEA",
    workerIndex,
    totalTransactions
}) {
    while (true) { // Loop until success
        try {
            // Connect to RPC
            const web3 = new Web3(new Web3.providers.HttpProvider(rpcChain));
            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const fromAddress = account.address;

            const nonce = await web3.eth.getTransactionCount(fromAddress);

            // Convert amount to integer (wei), assuming TEA has 18 decimals
            const amount = intToDecimal(amountToTransfer, 18);

            // Estimate gas
            const gasLimit = await web3.eth.estimateGas({
                from: fromAddress,
                to: toAddress,
                value: amount.toString() // Convert BigInt to string for compatibility
            });

            // Get gas price from RPC
            const gasPrice = await web3.eth.getGasPrice();

            // Calculate maxFeePerGas and maxPriorityFeePerGas
            const maxPriorityFeePerGas = web3.utils.toWei('2', 'gwei'); // Fixed priority fee 2 Gwei
            const maxFeePerGas = web3.utils.toWei('100', 'gwei');      // Fixed max fee 100 Gwei

            // Build EIP-1559 transaction
            const txParams = {
                type: 2,
                chainId: chainId,
                nonce: nonce,
                to: toAddress,
                value: amount.toString(), // Convert BigInt to string for compatibility
                gas: gasLimit,
                maxFeePerGas: maxFeePerGas,
                maxPriorityFeePerGas: maxPriorityFeePerGas
            };

            // Sign and send transaction
            const signedTxn = await web3.eth.accounts.signTransaction(txParams, privateKey);
            const txHash = await web3.eth.sendSignedTransaction(signedTxn.rawTransaction);

            // Increment the success counter for the specific worker atomically
            const currentCount = workerSuccessCounts.get(workerIndex) || 0;
            if (currentCount >= totalTransactions) {
                console.log(chalk.blue(
                    `\n>>> Worker ${workerIndex} has reached the maximum transactions (${totalTransactions}). Resting for 12 hours...`
                ));
                await new Promise(resolve => setTimeout(resolve, 6 * 60 * 60 * 1000)); // Rest for 6 hours
                console.log(chalk.blue(`\n>>> Worker ${workerIndex} resuming after 6 hours of rest...`));
                continue; // Continue the loop
            }
            workerSuccessCounts.set(workerIndex, currentCount + 1);

            console.log(chalk.green(
                `\n>>> Transfer [Worker ${workerIndex}][Success: ${currentCount} txs]: ${amountToTransfer} ${symbol} | ${fromAddress} => ${toAddress} | ${scan}/${txHash.transactionHash}`
            ));

            return; // Exit the loop on success
        } catch (error) {
            const errorMessage = error.message;
            console.log(chalk.white(`\n>>> Transfer [Worker ${workerIndex}]: ...${privateKey.slice(-30)} | Trying reconnect to RPC...`));

            // Check for specific errors to retry
            if (
                errorMessage.includes("Failed to check for transaction receipt:") ||
                errorMessage.includes("Invalid JSON RPC response") ||
                errorMessage.includes("Couldn't connect to node") ||
                errorMessage.includes("Connection refused") ||
                errorMessage.includes("Network Error") ||
                errorMessage.includes("CONNECTION")
            ) {
                console.log(chalk.blue(`Retrying transfer [Worker ${workerIndex}]...`));
                const retryDelay = randomInt(3000, 7001); // Random delay between 3 to 5 seconds
                await new Promise(resolve => setTimeout(resolve, retryDelay)); // Wait before retrying
            } else {
                return; // Exit on non-retryable errors
            }
        }
    }
}

if (isMainThread) {
    async function main() {
        try {
            // Wait for chalk to initialize
            while (!chalk) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const totalTransactionsMap = new Map(); // Map to track total transactions per worker

            // Load private keys and recipient addresses from files
            const privateKeys = fs.readFileSync('privatekey.txt', 'utf-8')
                .split('\n')
                .map(key => key.trim())
                .filter(key => key.length === 64); // Ensure valid private keys (64 characters)

            if (privateKeys.length === 0) {
                throw new Error("No valid private keys found in privatekey.txt");
            }

            const toAddresses = fs.readFileSync('toaddress.txt', 'utf-8')
                .split('\n')
                .map(address => address.trim())
                .filter(Boolean);

            if (toAddresses.length === 0) {
                throw new Error("No recipient addresses found in toaddress.txt");
            }

            // Set transfer range and transaction parameters from config
            const { minAmount, maxAmount, totalTransactions, interval, delay } = config;

            // Create a worker for each private key
            privateKeys.forEach((privateKey, workerIndex) => {
                const totalTransactionsCount = Math.min(
                    totalTransactions.max,
                    randomInt(totalTransactions.min, totalTransactions.max + 1)
                ); // Ensure max transactions
                totalTransactionsMap.set(workerIndex, totalTransactionsCount); // Track total transactions for each worker
                const intervalTime = randomInt(interval.min, interval.max + 1); // Random interval
                const delayTime = randomInt(delay.min, delay.max + 1); // Random delay
                setTimeout(() => {
                    new Worker(__filename, {
                        workerData: {
                            privateKey,
                            toAddresses,
                            minAmount,
                            maxAmount,
                            totalTransactions: totalTransactionsCount,
                            interval: intervalTime,
                            workerIndex
                        }
                    });
                }, delayTime);
            });

            resetSuccessCounters(totalTransactionsMap); // Call after chalk is initialized and totalTransactionsMap is set
        } catch (error) {
            console.error(chalk.red(`Error in main thread: ${error.message}`));
        }
    }

    main();
} else {
    // Worker thread logic
    const { privateKey, toAddresses, minAmount, maxAmount, totalTransactions, interval, workerIndex } = workerData; // Remove maxTransactions

    async function workerTask() {
        for (let i = 0; i < totalTransactions; i++) {
            const toAddress = toAddresses[Math.floor(Math.random() * toAddresses.length)]; // Random recipient
            const amountToTransfer = randomDecimal(minAmount, maxAmount, 10);

            // Call transfer function
            await transferTea({
                privateKey: privateKey,
                amountToTransfer: amountToTransfer,
                toAddress: toAddress,
                workerIndex, // Pass workerIndex to transferTea
                totalTransactions // Use totalTransactions directly
            });

            // Wait for the next interval
            if (i < totalTransactions - 1) {
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }

        parentPort.postMessage(`Worker for privateKey ${privateKey} completed.`);
    }

    workerTask().catch(error => {
        console.error(chalk.red(`Worker error for privateKey ${privateKey}: ${error.message}`));
    });
}
