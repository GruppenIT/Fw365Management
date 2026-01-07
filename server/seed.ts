import { db } from "./db";
import { users } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "admin@firewall365.com";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Administrador";

export async function seedDatabase(): Promise<void> {
  try {
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL))
      .limit(1);

    if (existingAdmin.length === 0) {
      const passwordHash = await hashPassword(ADMIN_PASSWORD);
      
      await db.insert(users).values({
        email: ADMIN_EMAIL,
        passwordHash,
        name: ADMIN_NAME,
        role: "admin",
      });

      console.log(`[seed] Admin user created: ${ADMIN_EMAIL}`);
    } else {
      console.log(`[seed] Admin user already exists: ${ADMIN_EMAIL}`);
    }
  } catch (error) {
    console.error("[seed] Error seeding database:", error);
  }
}
