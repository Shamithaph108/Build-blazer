import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://127.0.0.1:27017');

try {
  await client.connect();
  await client.db('admin').command({ ping: 1 });

  console.log('MongoDB connection successful!');

  await client.close();
} catch (error) {
  console.error('MongoDB connection failed:');
  console.error(error.message);
}