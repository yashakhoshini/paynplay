// Test script for real-club ops implementation
import { METHODS_CIRCLE, METHODS_EXTERNAL_LINK, STRIPE_CHECKOUT_URL, WITHDRAW_STALE_HOURS, FIXED_WALLETS, isAuthorized } from './dist/config.js';

console.log('=== Real-Club Ops Configuration Test ===');
console.log('METHODS_CIRCLE:', METHODS_CIRCLE);
console.log('METHODS_EXTERNAL_LINK:', METHODS_EXTERNAL_LINK);
console.log('STRIPE_CHECKOUT_URL:', STRIPE_CHECKOUT_URL ? 'SET' : 'NOT SET');
console.log('WITHDRAW_STALE_HOURS:', WITHDRAW_STALE_HOURS);
console.log('FIXED_WALLETS:', FIXED_WALLETS);
console.log('isAuthorized function:', typeof isAuthorized);

// Test authorization
console.log('\n=== Authorization Test ===');
console.log('isAuthorized(123):', isAuthorized(123));
console.log('isAuthorized(0):', isAuthorized(0));

console.log('\n=== Test Complete ===');
