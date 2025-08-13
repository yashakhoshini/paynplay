# Quick Start Guide - PayNPlay Multi-Tenant Bot System

## 🚀 For Testing/Development (No Real Clients Yet)

If you're just testing the system without real clients:

```bash
# Set up development environment with dummy values
setup-dev-environment.bat
```

Then replace the dummy values in Railway dashboard with real ones for testing.

## 🏢 For Onboarding Real Clients

When you have a real client to onboard:

```bash
# Onboard a new client
onboard-client.bat <club-name> <bot-token> <sheet-id> <group-id> <owner-ids> <loader-ids>
```

Example:
```bash
onboard-client.bat pokerclub 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms -1001234567890 123456789,987654321 111222333,444555666
```

## 📋 What You Need for Each Client

1. **Bot Token** - From @BotFather
2. **Google Sheet ID** - From client's Google Sheet
3. **Group ID** - Negative number from @userinfobot
4. **Owner IDs** - Comma-separated list from @userinfobot
5. **Loader IDs** - Comma-separated list from @userinfobot
6. **Google Credentials** - Your service account email and private key

## 🔧 Current Issue Fix

Your current deployment shows warnings because it's missing client-specific variables. To fix:

1. **For testing:** Use `setup-dev-environment.bat`
2. **For real clients:** Use `onboard-client.bat`

## 📚 Full Documentation

- **Client Onboarding Guide:** `CLIENT-ONBOARDING-GUIDE.md`
- **Finding Missing Values:** `FIND-MISSING-VALUES.md`

## 🎯 Next Steps

1. Set up development environment for testing
2. Test with real bot token and Google Sheet
3. When ready for clients, use the onboarding script
4. Each client gets their own isolated bot instance

---

**The system is designed for multi-tenancy - each client gets their own bot, service, and data isolation! 🎰**


