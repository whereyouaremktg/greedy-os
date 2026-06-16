import "server-only";
import { shipHeroRequest } from "@/lib/shiphero/client";

export type ShipHeroWarehouse = {
  id: string; // GraphQL global id (used as warehouse_id filter)
  legacyId: number;
  identifier: string;
};

type AccountData = {
  account: {
    data: {
      warehouses: Array<{
        id: string;
        legacy_id: number;
        identifier: string | null;
      }>;
    };
  };
};

const ACCOUNT_QUERY = /* GraphQL */ `
  query GlowAccountWarehouses {
    account {
      data {
        warehouses { id legacy_id identifier }
      }
    }
  }
`;

export async function fetchWarehouses(): Promise<ShipHeroWarehouse[]> {
  const { data } = await shipHeroRequest<AccountData>(ACCOUNT_QUERY);
  return (data.account?.data?.warehouses ?? []).map((w) => ({
    id: w.id,
    legacyId: w.legacy_id,
    identifier: w.identifier ?? "Primary",
  }));
}
