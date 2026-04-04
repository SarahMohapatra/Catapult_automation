import { getTicketById, updateTicket } from "../store/tickets";

// --- 1. THE MOCK EMAIL FUNCTION ---
// We will replace this with real Nodemailer/Gmail code later!
async function mockSendEmail(ticketId: string, userEmail: string, proposedSolution: string) {
  console.log(`\n=========================================`);
  console.log(`📧 MOCK EMAIL SENT`);
  console.log(`To: ${userEmail}`);
  console.log(`Subject: URGENT: L3 Action Required for ${ticketId}`);
  console.log(`Body: \nThe AI has proposed the following solution but requires approval:\n"${proposedSolution}"`);
  console.log(`=========================================\n`);
  return true;
}

// --- 2. THE MAIN AI LOGIC ---
export async function processTicket(ticketId: string, userEmail: string) {
  const ticket = getTicketById(ticketId);
  if (!ticket) throw new Error("Ticket not found");

  // In the future, you will ask your LLM for this data based on ticket.title & ticket.description.
  // For now, we are hardcoding a fake AI response to test the routing logic.
  const mockAiResponse = {
    tier: "L3", // Try changing this to "L1" or "L2" to test the other path!
    proposedSolution: "Restart the main production database to clear the memory leak."
  };

  if (mockAiResponse.tier === "L1" || mockAiResponse.tier === "L2") {
    // 🟢 L1/L2 Logic: Automatically solve and resolve
    updateTicket(ticketId, { 
      status: "resolved",
      // finalOutput: mockAiResponse.proposedSolution // (If your store supports updating this)
    });
    console.log(`✅ Ticket ${ticketId} categorized as ${mockAiResponse.tier} and resolved automatically.`);
    
  } else if (mockAiResponse.tier === "L3") {
    // 🔴 L3 Logic: Escalate, store the solution, and ping the user
    updateTicket(ticketId, { 
      status: "escalated",
      // escalationReport: mockAiResponse.proposedSolution // (If your store supports updating this)
    });
    
    // Ping the user's email with the ID and proposed solution
    await mockSendEmail(ticketId, userEmail, mockAiResponse.proposedSolution);
    console.log(`🚨 Ticket ${ticketId} categorized as L3. Escalated and email sent.`);
  }
}