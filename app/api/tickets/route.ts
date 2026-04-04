export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createTicket, getAllTickets } from "../../../backend/store/tickets";

export async function GET() {
  try {
    const tickets = getAllTickets();
    return NextResponse.json({ success: true, tickets });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description } = body;

    if (!title || !description) {
      return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
    }

    const ticket = createTicket({ title, description });
    return NextResponse.json({ success: true, ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
}