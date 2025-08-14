# Collaboration Setup Guide

## Quick Start for Collaborators

### Prerequisites
- Node.js 20.x installed
- Cursor IDE
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd paynplay
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
# Copy environment template
cp env-example.txt .env

# Edit .env with your configuration
# Required variables:
# - BOT_TOKEN (from BotFather)
# - SHEET_ID (Google Sheet ID)
# - GOOGLE_CLIENT_EMAIL (Service account email)
# - GOOGLE_PRIVATE_KEY (Service account private key)
# - LOADER_GROUP_ID (Telegram group ID)
```

### 4. Development Commands
```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### 5. Testing
```bash
# Test the bot
node test-bot.js

# Test with real club operations
node test-real-club-ops.js
```

## Cursor Collaboration Features

### Real-time Collaboration
**For Cursor 1.4.5:**
1. **Try Command Palette:** `Ctrl+Shift+P` → search "live share" or "collaboration"
2. **Install Live Share Extension:** `Ctrl+Shift+X` → search "Live Share" → install
3. **Alternative:** Use Git-based workflow below

**If collaboration features aren't available:**
- Use Git branches and pull requests
- Share code via GitHub
- Use external tools like Discord/Slack for real-time communication

### Git Workflow
1. **Create feature branch:** `git checkout -b feature-name`
2. **Make changes** and commit: `git commit -m "description"`
3. **Push and create PR:** `git push origin feature-name`
4. **Review and merge** through GitHub

### Code Review Tips
- Use Cursor's built-in diff viewer
- Leverage AI code review features
- Test changes locally before pushing

## Project Structure
```
src/
├── config.ts      # Environment configuration
├── index.ts       # Main bot logic
├── matcher.ts     # Buy-in/cash-out matching
├── messages.ts    # User-facing strings
├── roles.ts       # User role management
├── schemaMapper.ts # Google Sheets mapping
├── security.ts    # Security utilities
├── sheets.ts      # Google Sheets integration
└── types.ts       # TypeScript definitions
```

## Common Tasks

### Adding New Features
1. Create feature branch
2. Implement in `src/` directory
3. Add tests if applicable
4. Update documentation
5. Submit PR

### Debugging
- Use `debug-env.js` to check environment variables
- Use `debug-startup.js` for startup issues
- Check Railway logs for deployment issues

### Deployment
- Automatic deployment via Railway
- Manual deployment scripts available
- Environment variables managed in Railway dashboard

## Communication
- Use Cursor's built-in chat during real-time sessions
- Create issues in GitHub for bugs/features
- Use PR comments for code review feedback
