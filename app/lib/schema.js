import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["CHECKING", "SAVINGS", "CURRENT", "CREDIT", "LOAN"]),
  balance: z.string().min(1, "Initial balance is required"),
  isDefault: z.boolean().default(false),
});

export const transactionSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    amount: z.string().min(1, "Amount is required"),
    description: z.string().optional(),
    date: z.date({ required_error: "Date is required" }),
    accountId: z.string().min(1, "Account is required"),
    category: z.string().min(1, "Category is required"),
    isRecurring: z.boolean().default(false),
    recurringInterval: z
      .enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isRecurring && !data.recurringInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode,
        message: "Recurring interval is required when isRecurring is true",
        path: ["recurringInterval"], // path to the issue
      });
    }
  });
