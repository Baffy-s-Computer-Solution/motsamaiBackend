# 🚀 Quick Reference Guide - Motsamai Backend

## Installation & Setup

```bash
# Install dependencies
npm install

# Test database connection
npm run env:check

# Run migrations
npm run migrate

# Seed database with sample data
npm run seed:all

# Start development server
npm run dev

# Run tests
npm test

# Format code
npm run format

# Lint code
npm run lint
```

## Database Management

```bash
# Seed specific data
npm run seed:users          # Users only
npm run seed:drivers        # Drivers & vehicles
npm run seed:rides          # Rides & payments

# Reset entire database
npm run db:reset

# Undo last migration
npm run migrate:undo
```

## Development Commands

```bash
# Start in development (with hot reload)
npm run dev

# Start in production
npm start

# Start with cluster mode
npm run start:cluster

# Format all files
npm run format

# Lint all files
npm run lint -- fix
```

## Testing

```bash
# Run all tests
npm test

# Watch mode (rerun on changes)
npm run test:watch

# Coverage report
npm run test:coverage

# Run specific test file
npm test -- api.test.js
```

## API Endpoints (After Starting Server)

### Health Checks
```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/v1/health
```

### Documentation
```
http://localhost:4000/api-docs  # Swagger UI
```

### Example Requests

#### Get User Profile
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:4000/api/v1/users/profile
```

#### Update Profile
```bash
curl -X PUT \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"John","last_name":"Doe"}' \
  http://localhost:4000/api/v1/users/profile
```

#### Get User Statistics
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:4000/api/v1/users/stats
```

#### List Drivers
```bash
curl "http://localhost:4000/api/v1/drivers?page=1&limit=20&role=driver"
```

#### Get Rides
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:4000/api/v1/rides?page=1&limit=10"
```

## Environment Variables

### Essential Variables
```env
DATABASE_URL=postgresql://HOST:5432/DATABASE
JWT_SECRET=replace-me
NODE_ENV=development
PORT=4000
```

### Optional Variables
```env
REDIS_URL=redis://localhost:6379
SENDGRID_API_KEY=sg_...
STRIPE_API_KEY=sk_...
FIREBASE_PROJECT_ID=...
```

## File Structure

```
web-backend/
├── src/
│   ├── controllers/        # API endpoint handlers
│   ├── services/           # Business logic
│   ├── repositories/       # Data access layer
│   ├── models/             # Database models
│   ├── middleware/         # Express middleware
│   ├── utils/              # Helper functions
│   ├── config/             # Configuration
│   ├── seeders/            # Database seeders
│   └── routes/             # API routes
├── tests/                  # Test files
├── migrations/             # Database migrations
├── logs/                   # Log files
├── package.json            # Dependencies
├── .env                    # Environment config
└── server.js               # Entry point
```

## Common Tasks

### Add a New User via API
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890"
  }'
```

### View Database Data
```bash
# Connect to PostgreSQL
psql postgresql://HOST:5432/DATABASE

# Common queries
SELECT COUNT(*) FROM "Users";
SELECT COUNT(*) FROM "Drivers";
SELECT COUNT(*) FROM "Rides";
SELECT COUNT(*) FROM "Payments";

# Export to CSV
\COPY (SELECT * FROM "Users") TO 'users.csv' WITH CSV HEADER;
```

### Create Backup
```bash
pg_dump postgresql://HOST:5432/DATABASE > backup.sql
```

### Restore Backup
```bash
psql postgresql://HOST:5432/DATABASE < backup.sql
```

## Debugging Tips

### Enable Verbose Logging
```env
LOG_LEVEL=debug
DB_LOGGING=true
```

### View Logs
```bash
# Development (console)
npm run dev

# Production (log files)
cat logs/error.log
cat logs/combined.log
tail -f logs/error.log  # Real-time
```

### Test Database Connection
```bash
npm run env:check
```

### View Active Connections
```sql
SELECT pid, usename, application_name, state FROM pg_stat_activity;
```

### Kill Slow Queries
```sql
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE query_start < NOW() - INTERVAL '5 minutes';
```

## Performance Tips

1. **Enable Query Caching**: Redis configuration
2. **Monitor Performance**: Check response times
3. **Use Pagination**: Never fetch all records
4. **Index Frequently Queried Columns**: For large tables
5. **Archive Old Data**: Move historical data to separate tables

## Security Checklist

- [ ] `.env` file not committed to git
- [ ] Strong JWT secret configured
- [ ] Database user has minimal permissions
- [ ] SSL enabled for database connections
- [ ] CORS configured for your domain only
- [ ] Rate limiting enabled
- [ ] Helmet security headers enabled
- [ ] Input validation on all endpoints
- [ ] Regular security audits scheduled

## Troubleshooting

### "Cannot find module" Error
```bash
rm -rf node_modules package-lock.json
npm install
```

### Database Connection Failed
```bash
# Check credentials in .env
# Verify database is running
# Test connection:
npm run env:check
```

### Port Already in Use
```bash
# Find process using port 4000
lsof -i :4000

# Kill the process
kill -9 PID
```

### Tests Failing
```bash
# Run with verbose output
npm test -- --verbose

# Run specific test
npm test -- --testNamePattern="user"
```

### Permission Denied Error
```bash
# Make scripts executable
chmod +x setup-and-test.sh
chmod +x setup-and-test.ps1
```

## Useful Links

- [Node.js Docs](https://nodejs.org/docs/)
- [Express Guide](https://expressjs.com/)
- [Sequelize ORM](https://sequelize.org/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [JWT.io](https://jwt.io/)

## Support

For issues, check:
1. ENHANCEMENTS.md - Comprehensive guide
2. PROJECT_SUMMARY.md - Project overview
3. Logs in `logs/` directory
4. Test output with `npm test`

---

**Last Updated**: 2026-06-17
