export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
// EXACTLY 4 levels up: ../../../../
import { getTicketById, updateTicket } from "../../../../backend/store/tickets";
import { TicketStatus } from "../../../../backend/types/ticket";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticket = getTicketById(id);

    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedUpdates: {
      title?: string;
      description?: string;
      status?: TicketStatus;
    } = {};

    if (typeof body.title === "string") {
      allowedUpdates.title = body.title;
    }
    if (typeof body.description === "string") {
      allowedUpdates.description = body.description;
    }
    
    const validStatuses = ["received", "classified", "in_progress", "resolved", "escalated", "failed"];
    if (typeof body.status === "string" && validStatuses.includes(body.status)) {
      allowedUpdates.status = body.status as TicketStatus;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json({ success: false, error: "No valid fields" }, { status: 400 });
    }

    const updatedTicket = updateTicket(id, allowedUpdates);

    if (!updatedTicket) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}