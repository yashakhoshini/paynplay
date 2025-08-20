# Collaboration Setup Guide

## Quick Start for Collaborators

### Prerequisites
- Node.js 20.x installed
- Cursor IDE
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/yashakhoshini/paynplay.git
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

## Collaboration Methods

**Since real-time collaboration isn't available in Cursor 1.4.5, use these methods:**

### **1. Git-based Workflow (Recommended)**
- Create feature branches for each task
- Use pull requests for code review
- Merge changes through GitHub
- This is the industry standard approach

### **2. External Communication Tools**
- **Discord/Slack:** For voice calls and screen sharing
- **GitHub Issues:** For tracking bugs and features
- **GitHub Discussions:** For team discussions
- **Email:** For formal communication

### **3. Code Review Process**
- Use GitHub's PR interface for code reviews
- Use Cursor's built-in diff viewer
- Leverage AI code review features in Cursor

## Git Workflow

### **For Feature Development:**
1. **Create feature branch:** `git checkout -b feature-name`
2. **Make changes** and commit: `git commit -m "description"`
3. **Push and create PR:** `git push origin feature-name`
4. **Review and merge** through GitHub

### **For Bug Fixes:**
1. **Create hotfix branch:** `git checkout -b hotfix/bug-description`
2. **Fix the issue** and test locally
3. **Commit and push:** `git push origin hotfix/bug-description`
4. **Create PR** for review

### **For Collaborative Development:**
1. **Assign tasks** using GitHub Issues
2. **Work on separate branches** for each task
3. **Regular sync meetings** via Discord/Slack
4. **Code review** through GitHub PRs
5. **Merge to main** after approval

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
- Use Discord/Slack for real-time communication
- Create issues in GitHub for bugs/features
- Use PR comments for code review feedback
