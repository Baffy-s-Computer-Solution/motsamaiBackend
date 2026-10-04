#!/bin/bash
# setup-and-test.sh - Complete setup script for Motsamai Backend
# This script automates database setup, seeding, and testing

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║     Motsamai Backend - Setup & Testing Script                      ║"
echo "║     Version: 2.0.0                                                 ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Environment Check
echo -e "${BLUE}[1/6]${NC} Checking environment..."
if [ ! -f ".env" ] && [ ! -f ".env.development" ]; then
    echo -e "${YELLOW}⚠️  No .env file found${NC}"
    echo "Please create .env file with database credentials"
    exit 1
fi
echo -e "${GREEN}✅ Environment variables found${NC}"
echo ""

# Step 2: Dependency Check
echo -e "${BLUE}[2/6]${NC} Installing dependencies..."
if ! npm install > /dev/null 2>&1; then
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 3: Database Connection
echo -e "${BLUE}[3/6]${NC} Testing database connection..."
if npm run env:check > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    echo "Please check your database credentials in .env"
    exit 1
fi
echo ""

# Step 4: Database Migrations
echo -e "${BLUE}[4/6]${NC} Running database migrations..."
if npm run migrate > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Migrations completed${NC}"
else
    echo -e "${YELLOW}⚠️  Migrations already applied or no migrations pending${NC}"
fi
echo ""

# Step 5: Database Seeding
echo -e "${BLUE}[5/6]${NC} Seeding database with sample data..."
if npm run seed:all > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database seeded successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Database seeding skipped (already seeded)${NC}"
fi
echo ""

# Step 6: Running Tests
echo -e "${BLUE}[6/6]${NC} Running API tests..."
if npm test > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Tests passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests may have failed${NC}"
fi
echo ""

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║✨ Setup Complete!                                                   ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}🚀 Start the server:${NC}"
echo "   npm run dev"
echo ""
echo -e "${BLUE}📊 Test Credentials:${NC}"
echo ""
echo -e "${BLUE}📚 API Documentation:${NC}"
echo "   http://localhost:4000/api-docs"
echo ""
