import { NextResponse } from "next/server";
import { getAllTickets, createTicket } from "../../../backend/store/tickets";
// 1. Import your new processing function
import { processTicket } from "../../../backend/tools/processTickets";

export const dynamic = "force-dynamic";

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

    if (!body.title || !body.description) {
      return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
    }

    // 2. Create the ticket
    const newTicket = createTicket({
      title: body.title,
      description: body.description,
    });

    // 3. IMMEDIATELY test the L3 AI logic on the new ticket
    await processTicket(newTicket.id, "vikramr.kavalipati@gmail.com");

    return NextResponse.json({ success: true, ticket: newTicket }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to create" }, { status: 500 });
  }
}