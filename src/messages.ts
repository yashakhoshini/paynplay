export const MSG = {
  welcome: (club: string) => `Welcome to ${club}! Choose an option:`,
  selectMethod: "Select a payment method:",
  enterAmount: "Send the amount you want to buy in (numbers only).",
  invalidAmount: "Please send a valid number amount (e.g., 75).",
  playerMatchedPay: (amt: number, cur: string, method: string, recv?: string) =>
    `Matched to an existing cash-out.\n` +
    `Pay **${amt} ${cur}** via ${method} to **${recv ?? "<ask recipient>"}**.\n\n` +
    `Then *post your payment screenshot in the group chat*. A loader/owner will confirm.\n`,
  playerOwnerPay: (amt: number, cur: string, method: string, handle: string, extra?: string) =>
    `Pay **${amt} ${cur}** via ${method} to **${handle}**.\n\n` +
    `${extra ?? ""}Then *post your payment screenshot in the group chat*. A loader/owner will confirm.\n`,
  groupCard: (player: string, amt: number, cur: string, method: string, recv: string) =>
    `🧾 *Transaction*\n` +
    `Player: ${player}\n` +
    `Amount: *${amt} ${cur}*\n` +
    `Method: ${method}\n` +
    `Pay to: *${recv}*\n\n` +
    `Loaders/Owners: review the screenshot reply thread, then confirm.`,
  notAuthorized: "You're not authorized to confirm payments.",
  paidConfirmed: (verifier: string, iso: string) => `✅ Paid confirmed by ${verifier} at ${iso}`,
  
  // Legacy messages for backward compatibility
  ownerPay: (amt: number, cur: string, method: string, handle: string, extra?: string) =>
    `Pay **${amt} ${cur}** via ${method} to **${handle}**.\n\n${extra ?? ''}`,
  matchedPay: (amt: number, cur: string, method: string, recv?: string) =>
    `Matched to an existing cash-out.\nPay **${amt} ${cur}** via ${method} to **${recv ?? '<ask recipient>'}**.\n\nAfter sending, tap 'Mark Paid'.`,
  markPaid: '✅ Mark Paid',
  buyIn: '💸 Buy-In',
  custom: 'Custom',
  pong: 'pong ✅',
  errorGeneric: 'Sorry, something went wrong. Please try again or contact the owner.',
  errorSheets: 'Unable to access the payment sheet. Please contact the owner.',
  noOwnerHandle: 'Please ask the owner for payment instructions.',
  amountQuickPicks: 'Select amount or enter custom:',
  processing: 'Processing your request...',
  buyinRecorded: 'Your buy-in has been recorded. Please complete the payment.',
  paymentComplete: 'Payment marked as complete! Thank you.',
  
  // Group workflow messages
  groupWelcome: (botUsername: string) => 
    `🎰 **Pay-n-Play Bot Setup**\n\n` +
    `**Players:** DM @${botUsername} or type /start here to begin a buy-in.\n\n` +
    `**Loaders/Owners:** Verify screenshots and click Mark Paid on the transaction card.\n\n` +
    `Reply to transaction cards with screenshot proof.`,
  
  reminderFirstTime: (botUsername: string) => 
    `Hi 👋 — you can DM me (@${botUsername}) or type /start here to buy in.`,
  
  transactionCard: (playerName: string, amount: number, currency: string, method: string, payeeHandle: string) =>
    `💸 **Buy-In Request**\n\n` +
    `**Player:** ${playerName}\n` +
    `**Amount:** ${amount} ${currency}\n` +
    `**Method:** ${method}\n` +
    `**Pay to:** ${payeeHandle}\n\n` +
    `Reply with screenshot proof, then click Mark Paid.`,
  
  viewSheet: '🗒 View Sheet',
  adminPinRequest: 'Admin can pin this message for visibility.',
  screenshotHint: 'Reply to this transaction card with the screenshot proof.'
};
