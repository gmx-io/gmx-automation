# Setting Up a New Web3 Function

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

```js
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

  const someService = getSomeService({
    chainId: gelatoArgs.chainId,
    storage: context.storage,
    provider: multiChainProvider.default(),
  });

  // Example: Read data from dataStore
  const someValue = await someService.getUintValue(userArgs.someKey as string);

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

Note:
Don't call contracts directly. Introduce services instead.

### 4. Create Index File

Create `index.ts` to export and initiate your function:

```typescript
import { Web3Function } from "@gelatonetwork/web3-functions-sdk";
import { yourFunction } from "./yourFunction";

Web3Function.onRun(yourFunction);
```

### 5. Writing Tests

Create a test file for your function in `src/test/` directory:

```typescript
import { Web3FunctionResultCallData } from "@gelatonetwork/web3-functions-sdk";
import { expect } from "chai";
import { yourFunction } from "../web3-functions/your-function-name/yourFunction";
import { createMockedEventContext } from "../lib/mock";

describe("YourFunction Tests", function () {
  it("should execute when conditions are met", async () => {
    // Mock any services your function depends on
    setYourServiceForTesting({
      getSomeData: () => Promise.resolve([]),
    });

    // Create mocked context with test data
    const context = createMockedEventContext({
      userArgs: {
        someArg: "testValue",
      },
    });

    // Execute function
    const result = await yourFunction(context);

    // Assert results
    expect(result.canExec).to.equal(true);

    if (!result.canExec) throw new Error("canExec == false");

    // Verify callData if function should execute
    const callData = result.callData[0] as Web3FunctionResultCallData;

    // Add specific assertions for your function's callData
    expect(callData.to).to.be.a("0x00...");
    expect(callData.data); // here we can decode data and check if it's correct
  });
});
```

Key testing points:

- Use `createMockedEventContext` to simulate the Web3Function context
- Mock any external services your function depends on
- Test both successful and failed execution paths
- Verify the generated callData matches expected contract interactions

# Library Directory (`src/lib`)

The `lib` directory contains essential utilities and helpers for Web3 function development:

### Core Utilities

**MockedJsonRpcProvider.ts**

- Mock implementation of JsonRpcProvider for testing
- Overrides standard provider methods to throw errors
- Useful for ensuring real RPC calls aren't made during tests

**contracts.ts**

- Handles contract instantiation and management
- Provides `getContracts` function for creating contract instances
- Includes typed contract interfaces

**events.ts**

- Utilities for parsing and handling (mainly) gmx events
- Defines `KeyValueEventData` type

**gelato.ts**

- Utilities for Gelato's automation system
- Defines interfaces for secrets management
- Provides storage interface
- Includes helper functions for secrets

### Data Handling

**hashing.ts**

- Cryptographic hashing utilities
- `hashData` function for arbitrary data types
- `hashString` for simple string hashing

**keys/index.ts** and **keys/keys.ts**

- System-wide constants
- Key generation functions
- Hash-based key generators
- Exports common constants

### Testing Tools

**mock.ts**

- Testing utilities for mocked contexts
- `createMockedContext` and `createMockedEventContext` functions
- Simulates Web3Function execution environment

### Number & Data Utilities

**number.ts**

- Comprehensive number handling
- BigNumber type utilities
- Common numerical constants
- Decimal handling and math operations
- Type conversion functions

**random.ts**

- Random blockchain value generation
- Address generation
- Hash generation
- Wallet creation for testing
- Seeded random generation
