import { Resend } from "resend";
import { getTicketById, updateTicket } from "../store/tickets";

// Initialize Resend with the API key from your .env.local file
const resend = new Resend(process.env.RESEND_API_KEY);

// --- 1. THE RESEND EMAIL FUNCTION ---
async function sendResendEmail(
  ticketId: string, 
  userEmail: string, 
  ticketTitle: string, 
  ticketDescription: string, 
  proposedSolution: string
) {
  try {
    const { data, error } = await resend.emails.send({
      from: "IT Support AI <onboarding@resend.dev>",
      to: [userEmail], 
      subject: `URGENT: L3 Action Required for Ticket ${ticketId} - ${ticketTitle}`,
      text: `An L3 severity issue has been categorized.\n\n` +
            `TICKET DETAILS:\n` +
            `ID: ${ticketId}\n` +
            `Issue: ${ticketTitle}\n` +
            `Description: ${ticketDescription}\n\n` +
            `PROPOSED AI SOLUTION:\n` +
            `${proposedSolution}\n\n` +
            `Please review and authorize this action.`,
    });
    
    // Check if Resend sent back an error
    if (error) {
      console.error("❌ Resend API rejected the email:", error);
      return false;
    }

    // If we get here, data is guaranteed to exist!
    console.log(`✅ Resend email successfully sent! ID:`, data?.id);
    return true;

  } catch (err) {
    console.error("❌ Code crashed while sending Resend email:", err);
    return false;
  }
}

// --- 2. THE MAIN AI LOGIC ---
export async function processTicket(ticketId: string, userEmail: string) {
  const ticket = getTicketById(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  const mockAiResponse = {
    tier: "L3", 
    proposedSolution: "Restart the main production database to clear the memory leak."
  };

  if (mockAiResponse.tier === "L1" || mockAiResponse.tier === "L2") {
    updateTicket(ticketId, { status: "resolved" });
    console.log(`✅ Ticket ${ticketId} categorized as ${mockAiResponse.tier} and resolved automatically.`);
  } else if (mockAiResponse.tier === "L3") {
    updateTicket(ticketId, { status: "escalated" });
    
    // Call our new Resend function instead of the mock one, passing the title and description
    await sendResendEmail(
      ticketId, 
      userEmail, 
      ticket.title, 
      ticket.description, 
      mockAiResponse.proposedSolution
    );
    console.log(`🚨 Ticket ${ticketId} categorized as L3. Escalated and email sent.`);
  }
}