
export interface SimulationInputs {
  rpcUrl: string;
  sender: string;
  to: string;
  calldata: string;
  amount: string;
  msgValue: string;
  shouldDealToken: boolean;
  tokenAddress: string;
  spender: string;
}

export const generateSimulationTest = (inputs: SimulationInputs): string => {
  const {
    rpcUrl,
    sender,
    to,
    calldata,
    amount,
    msgValue,
    shouldDealToken,
    tokenAddress,
    spender,
  } = inputs;

  const dealCode = shouldDealToken
    ? ` // Deal tokens to sender
        deal(${tokenAddress}, ${sender}, ${amount || '0'});
        
        // Approve spender if specified
        if (${spender} != address(0)) {
            vm.startPrank(${sender});
            IERC20(${tokenAddress}).approve(${spender}, ${amount || '0'});
            vm.stopPrank();
        }`
    : '';

  // Use a default sender if not provided, though the UI requires it.
  const safeSender = sender || 'address(0)';
  const safeTo = to || 'address(0)';
  const safeValue = msgValue || '0';
  const safeCalldata = calldata || '';

  return `// SPDX-License-Identifier: UNLICENSED
    pragma solidity ^0.8.13;

    import "forge-std/console.sol";
    import "forge-std/Test.sol";

    interface IERC20 {
        function approve(address spender, uint256 amount) external returns (bool);
    }

    contract SimulationTest is Test {
        function setUp() public {
          vm.selectFork(vm.createFork("${rpcUrl}"));
        }

        function testSimulation() public {
            ${dealCode}

            // Execute Transaction
            if (${safeSender} != address(0)) {
                vm.startPrank(${safeSender});
                console.log("Simulating call from", ${safeSender});
                
                string memory callDataStr = "${safeCalldata}";
                bytes memory callData = vm.parseBytes(callDataStr);
                
                (bool success, ) = address(${safeTo}).call{value: ${safeValue}}(callData);
                
                if (success) {
                    console.log("Transaction Successful");
                } else {
                    console.log("Transaction Failed");
                }
                
                vm.stopPrank();
            }
        }
    }`;
};
