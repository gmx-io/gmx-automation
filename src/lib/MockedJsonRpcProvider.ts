import { JsonRpcProvider } from "@ethersproject/providers";

export class MockedJsonRpcProvider extends JsonRpcProvider {
  async send(method: string, params: Array<any>): Promise<any> {
    // Return empty response for any request
    return null;
  }
}
