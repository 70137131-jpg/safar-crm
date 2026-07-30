import { db } from "../lib/db";

type Privileges = {
  currentUser: string;
  canSelect: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

async function main() {
  const [row] = await db.$queryRaw<Privileges[]>`
    SELECT
      current_user AS "currentUser",
      has_table_privilege(current_user, '"AuditLog"', 'SELECT') AS "canSelect",
      has_table_privilege(current_user, '"AuditLog"', 'INSERT') AS "canInsert",
      has_table_privilege(current_user, '"AuditLog"', 'UPDATE') AS "canUpdate",
      has_table_privilege(current_user, '"AuditLog"', 'DELETE') AS "canDelete"`;
  if (!row) throw new Error("Could not inspect database privileges");
  console.warn(JSON.stringify(row, null, 2));
  if (row.currentUser !== "crm_app" || !row.canSelect || !row.canInsert || row.canUpdate || row.canDelete) {
    throw new Error("Runtime role is not the restricted crm_app role; see RUNBOOK.md §3");
  }
  console.warn("Runtime database role is correctly restricted.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
