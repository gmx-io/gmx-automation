## Setting Up a New Web3 Function

### 1. Create Function Directory Structure

Create a new directory under `src/web3-functions/` with your function name. You'll need three main files:

```
src/web3-functions/your-function-name/
├── index.ts
├── schema.json
└── yourFunction.ts
```

### 2. Create Schema File

Create `schema.json` to define your function's configuration:

```json
{
  "web3FunctionVersion": "2.0.0",
  "runtime": "js-1.0",
  "memory": 128,
  "timeout": 30,
  "userArgs": {
    // Define your function's arguments here
    "yourArgName": "string"
  }
}
```

### 3. Create Main Function File

Create your main function file (e.g., yourFunction.ts) with this basic structure:

```typescript
import {
  Web3Function,
  Web3FunctionEventContext,
} from "@gelatonetwork/web3-functions-sdk";
import { getContracts } from "../../lib/contracts";

export const yourFunction: Parameters<typeof Web3Function.onRun>[0] = async (
  context: Web3FunctionEventContext
) => {
  // Destructure useful context properties
  const { log, multiChainProvider, userArgs, gelatoArgs } = context;

  // Initialize contracts using getContracts
  const contracts = getContracts(
    gelatoArgs.chainId,
    multiChainProvider.default()
  );

  // Example: Read data from dataStore
  const someValue = await contracts.dataStore.getUint(
    userArgs.someKey as string
  );

  // Example: Check condition for execution
  if (someValue.gt(1000)) {
    // Example: Prepare transaction data
    return {
      canExec: true,
      callData: [
        {
          to: contracts.orderHandler.address,
          data: contracts.orderHandler.interface.encodeFunctionData(
            "someFunction",
            [userArgs.someParam]
          ),
        },
      ],
    };
  }

  return {
    canExec: false,
    message: "Condition not met",
  };
};
```

### 4. Create Index File

Create `index.ts` to export and initiate your function:

```typescript
import { Web3Function } from "@gelatonetwork/web3-functions-sdk";
import { yourFunction } from "./yourFunction";

Web3Function.onRun(yourFunction);
```

### 5. Writing tests

TBD
