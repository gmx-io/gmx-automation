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
export const yourFunction: Parameters<typeof Web3Function.onRun>[0] = async (
  context: Context<Web3FunctionEventContext>
) => {
  // Destructure useful context properties
  const { log, multiChainProvider, userArgs, gelatoArgs, services, contracts } =
    context;

  // Example: Read data from service (which asks dataStore)
  const someValue = await services.someService.getUintValue(
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

Note:
Don't call contracts directly. Introduce services instead.
See also `src/web3-functions/example-function/exampleFunction.ts`.

### 4. Create Index File

Create `index.ts` to export and initiate your function:

```typescript
import { Web3Function } from "@gelatonetwork/web3-functions-sdk";
import { yourFunction } from "./yourFunction";
import { wrapContext } from "../../lib/gelato";

Web3Function.onRun(wrapContext(yourFunction));
```

### 5. Writing Tests

Please see `ExampleFunction.test.ts` for example.

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
- Context helper
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
