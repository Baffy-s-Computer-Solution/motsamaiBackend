require('dotenv').config({ path: '.env.production' });

const { createClient } = require('@supabase/supabase-js');
const { admin, authFirebaseApp } = require('../src/config/firebase');
const { sequelize } = require('../src/models');

const EXPECTED = {
  postgres: 8,
  firebase: 2,
  supabase: 7,
};

const isAdminMetadata = (user) => (
  user?.app_metadata?.role === 'admin'
  || user?.user_metadata?.role === 'admin'
  || user?.app_metadata?.is_admin === true
  || user?.user_metadata?.is_admin === true
);

const listFirebaseUsers = async () => {
  if (!authFirebaseApp) return [];
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth(authFirebaseApp).listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
};

const listSupabaseUsers = async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return [];
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [];
  let page = 1;
  do {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    users.push(...result.data.users);
    if (result.data.users.length < 1000) break;
    page += 1;
  } while (true);
  return users;
};

const deletePostgresUsers = async (nonAdminIds) => {
  await sequelize.transaction(async (transaction) => {
    const [foreignKeys] = await sequelize.query(`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'users'
        AND tc.table_schema = 'public'
    `, { transaction });

    for (const foreignKey of foreignKeys) {
      if (foreignKey.table_name === 'users') continue;
      const table = `"${foreignKey.table_name.replace(/"/g, '""')}"`;
      const column = `"${foreignKey.column_name.replace(/"/g, '""')}"`;
      await sequelize.query(
        `DELETE FROM ${table} WHERE ${column} = ANY($1::uuid[])`,
        { bind: [nonAdminIds], transaction },
      );
    }

    await sequelize.query(
      'DELETE FROM "users" WHERE role <> \'admin\'',
      { transaction },
    );
  });
};

const main = async () => {
  const { User } = require('../src/models');
  const postgresUsers = await User.findAll({
    attributes: ['id', 'email', 'role'],
    paranoid: false,
    raw: true,
  });
  const postgresAdmins = postgresUsers.filter((user) => user.role === 'admin');
  const postgresNonAdmins = postgresUsers.filter((user) => user.role !== 'admin');
  if (postgresNonAdmins.length !== EXPECTED.postgres || postgresAdmins.length !== 1) {
    throw new Error(`PostgreSQL safety check failed: expected 8 non-admins and 1 admin, found ${postgresNonAdmins.length} and ${postgresAdmins.length}`);
  }

  const firebaseUsers = await listFirebaseUsers();
  const adminEmails = new Set(postgresAdmins.map((user) => user.email));
  const firebaseNonAdmins = firebaseUsers.filter((user) => (
    !isAdminMetadata(user) && !adminEmails.has(user.email)
  ));
  if (firebaseNonAdmins.length !== EXPECTED.firebase) {
    throw new Error(`Firebase safety check failed: expected ${EXPECTED.firebase} deletions, found ${firebaseNonAdmins.length}`);
  }

  const supabaseUsers = await listSupabaseUsers();
  const supabaseNonAdmins = supabaseUsers.filter((user) => !isAdminMetadata(user));
  if (supabaseNonAdmins.length !== EXPECTED.supabase) {
    throw new Error(`Supabase safety check failed: expected 7 deletions, found ${supabaseNonAdmins.length}`);
  }

  console.log(`Deleting confirmed reset scope: PostgreSQL ${EXPECTED.postgres}, Firebase ${EXPECTED.firebase}, Supabase ${EXPECTED.supabase}.`);
  console.log('Firestore: skipped by design.');

  await deletePostgresUsers(postgresNonAdmins.map((user) => user.id));

  for (const user of firebaseNonAdmins) {
    await admin.auth(authFirebaseApp).deleteUser(user.uid);
  }

  if (supabaseNonAdmins.length > 0) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const user of supabaseNonAdmins) {
      const result = await client.auth.admin.deleteUser(user.id);
      if (result.error) throw result.error;
    }
  }

  console.log('Reset complete. Admin records preserved.');
};

main()
  .catch((error) => {
    console.error(`Reset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
