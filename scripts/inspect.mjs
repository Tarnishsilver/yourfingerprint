/**
 * Read-only inspection CLI for the observations collection.
 *
 *   npm run inspect                 # 5 most recent documents, full detail
 *   npm run inspect -- --limit 20
 *   npm run inspect -- --summary    # compact table, no fingerprint body
 *   npm run inspect -- --id <_id>   # one document
 *   npm run inspect -- --count      # just the document count
 *
 * This is a debugging aid for you to look at what the collector stored. It only
 * reads. It never writes, never compares two fingerprints, and computes no
 * similarity or uniqueness score.
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}

function value(name) {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env (see .env.example).');
  process.exit(1);
}

const databaseName = process.env.MONGODB_DATABASE?.trim() || 'fingerprint_lab';
const collectionName = process.env.MONGODB_COLLECTION?.trim() || 'observations';
const limit = Number.parseInt(value('--limit') ?? '5', 10);
const summaryOnly = flag('--summary');
const countOnly = flag('--count');
const singleId = value('--id');

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: Number.parseInt(process.env.MONGODB_TIMEOUT_MS ?? '5000', 10),
});

try {
  await client.connect();
  const collection = client.db(databaseName).collection(collectionName);
  const location = `${databaseName}.${collectionName}`;

  if (countOnly) {
    const total = await collection.countDocuments();
    console.log(`${location}: ${total} document(s)`);
    process.exit(0);
  }

  if (singleId) {
    const document = await collection.findOne({ _id: new ObjectId(singleId) });
    if (!document) {
      console.error(`No document with _id ${singleId}`);
      process.exit(1);
    }
    console.log(JSON.stringify(document, null, 2));
    process.exit(0);
  }

  const documents = await collection.find({}, { sort: { storedAt: -1 }, limit }).toArray();

  if (documents.length === 0) {
    console.log(`${location} is empty. Open http://127.0.0.1:8787/ in a browser to add one.`);
    process.exit(0);
  }

  if (!summaryOnly) {
    for (const document of documents) {
      console.log('='.repeat(72));
      console.log(`_id                ${document._id}`);
      console.log(`storedAt           ${document.storedAt?.toISOString?.() ?? document.storedAt}`);
      console.log(`clientGeneratedAt  ${document.clientGeneratedAt}`);
      console.log(`hash               ${document.clientFingerprintHash}`);
      console.log(`server.ip          ${document.server?.ip} (${document.server?.ipVersion})`);
      console.log(`server.ua          ${document.server?.userAgent}`);
      console.log(`diagnostics        ${document.diagnostics?.length ?? 0} degraded probe(s)`);
      console.log('='.repeat(72));
      console.log(JSON.stringify(document.fingerprint, null, 2));
      console.log();
    }
  } else {
    console.log(
      ['storedAt'.padEnd(26), 'hash'.padEnd(18), 'ip'.padEnd(18), 'platform'.padEnd(12), 'tz'].join(' '),
    );
    console.log('-'.repeat(100));
    for (const document of documents) {
      const fingerprint = document.fingerprint ?? {};
      console.log(
        [
          String(document.storedAt?.toISOString?.() ?? '').padEnd(26),
          String(document.clientFingerprintHash ?? '').slice(0, 16).padEnd(18),
          String(document.server?.ip ?? '').padEnd(18),
          String(fingerprint.hardware?.platformFamily ?? '?').padEnd(12),
          String(fingerprint.timezone?.timeZone ?? '?'),
        ].join(' '),
      );
    }
  }
} catch (error) {
  console.error(`Failed to read ${databaseName}.${collectionName}:`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}