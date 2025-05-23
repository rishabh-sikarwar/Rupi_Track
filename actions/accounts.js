"use server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";

const serializeTransaction = (obj) => {
  const serialized = { ...obj };
  if (obj.balance) {
    serialized.balance = obj.balance.toNumber();
  }

  if (obj.amount) {
    serialized.amount = obj.amount.toNumber();
  }
  return serialized;
};

export async function updateDefaultAccouunt(accountId) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("User not authenticated");

    const user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
      },
    });
    if (!user) throw new Error("User not found");

    await db.account.updateMany({
      where: {
        userId: user.id,
        isDefault: true,
      },
      data: { isDefault: false },
    });

    const account = await db.account.update({
      where: {
        id: accountId,
        userId: user.id,
      },
      data: { isDefault: true },
    });

    revalidatePath("/dashboard");

    return { success: true, data: serializeTransaction(account) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getAccountWithTransactions(accountId, page=1, limit=10) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const skip = limit ? (page - 1) * limit : undefined
  const take = limit || undefined

  const user = await db.user.findUnique({
    where: {
      clerkUserId: userId,
    },
  });
  if (!user) {
    throw new Error("User not found");
  }

  const account = await db.account.findUnique({
    where: {
      id: accountId,
      userId: user.id,
    },
    include: {
      transactions: {
        orderBy: { date: "desc" },
        skip,
        take,
      },
      _count: {
        select: { transactions: true },
      },
    },
  });
  if (!account) return null;

  return {
    ...serializeTransaction(account),
    transactions: account.transactions.map(serializeTransaction),
    totalTransactions: account._count.transactions,
  };
}


export async function bulkDeleteTransactions(transactionIds) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const transactions = await db.transaction.findMany({
      where: {
        id: { in: transactionIds },
        userId: user.id,
      },
    });

    if (!transactions.length) {
      return { success: false, error: "No matching transactions found." };
    }

    const accountBalanceChanges = transactions.reduce((acc, transaction) => {
      const change =
        transaction.type === "EXPENSE"
          ? transaction.amount
          : -transaction.amount;
      acc[transaction.accountId] = (acc[transaction.accountId] || 0) + change;
      return acc;
    }, {});

    await db.$transaction(async (tx) => {
      await tx.transaction.deleteMany({
        where: {
          id: { in: transactionIds },
          userId: user.id,
        },
      });

      for (const [accountId, balanceChange] of Object.entries(
        accountBalanceChanges
      )) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: balanceChange } },
        });
      }
    });

    revalidatePath("/account/[id]");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
