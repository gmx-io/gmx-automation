import fetch from "node-fetch";
import { getSubgraphUrl } from "../config/subgraph";
import { SupportedChainId } from "../config/chains";

export class SubgraphService {
  private chainId: SupportedChainId;

  constructor({ chainId }: { chainId: SupportedChainId }) {
    this.chainId = chainId;
  }

  async querySubgraph(endpoint: string, query = ""): Promise<any> {
    const url = getSubgraphUrl(this.chainId, endpoint);
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ query }),
      headers: { "Content-Type": "application/json" },
    });

    const json = await response.json();
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }
    return json.data;
  }
}
