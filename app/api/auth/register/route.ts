import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RegisterBody;

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim().length > 0
        ? body.displayName.trim()
        : null;

    if (!email || password.length < 6) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Email is required and password must be at least 6 chars." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        displayName,
        passwordHash: passwordHash,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "USER_EXISTS" }, { status: 400 });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
