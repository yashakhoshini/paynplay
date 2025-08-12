export const MSG = {
  welcome: (club: string) => `Welcome to ${club}! Choose an option:`,
  selectMethod: 'Select a payment method:',
  enterAmount: 'Send the amount you want to buy in (numbers only).',
  invalidAmount: 'Please send a valid number amount (e.g., 75).',
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
  paymentComplete: 'Payment marked as complete! Thank you.'
};
