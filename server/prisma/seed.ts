import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await Promise.all(
    ["Alice", "Bob", "Charlie"].map((name) =>
      prisma.user.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  console.log(
    "Seeded users:",
    users.map((u) => `${u.id}: ${u.name}`),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
