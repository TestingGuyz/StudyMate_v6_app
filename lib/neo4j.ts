// Neo4j AuraDB client wrapper
// All queries are parameterized — no string concatenation

import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver';
import { Platform } from 'react-native';

let driver: Driver | null = null;

// Storage abstraction for SecureStore (mobile) / localStorage (web)
export async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  try {
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    localStorage.setItem(key, value);
    return;
  }
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Fallback — ignore
  }
}

export async function deleteStoredValue(key: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    localStorage.removeItem(key);
    return;
  }
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Fallback
  }
}

/**
 * Initialize or re-initialize the Neo4j driver using stored credentials.
 */
export async function initNeo4j(): Promise<boolean> {
  try {
    let uri = await getStoredValue('neo4j_uri');
    let username = await getStoredValue('neo4j_username');
    let password = await getStoredValue('neo4j_password');

    // Fallback to environment variables
    if (!uri) uri = process.env.EXPO_PUBLIC_NEO4J_URI || null;
    if (!username) username = process.env.EXPO_PUBLIC_NEO4J_USERNAME || null;
    if (!password) password = process.env.EXPO_PUBLIC_NEO4J_PASSWORD || null;

    if (!uri || !username || !password) {
      console.warn('Neo4j credentials not configured');
      return false;
    }

    // Close existing driver
    if (driver) {
      await driver.close();
    }

    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionLifetime: 3 * 60 * 1000,
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 10 * 1000,
      disableLosslessIntegers: true,
    });

    // Verify connectivity
    await driver.verifyConnectivity();
    return true;
  } catch (error) {
    console.error('Neo4j init failed:', error);
    return false;
  }
}

/**
 * Get a session from the driver. Auto-initializes if needed.
 */
async function getSession(): Promise<Session> {
  if (!driver) {
    const ok = await initNeo4j();
    if (!ok || !driver) {
      throw new Error('Neo4j not connected. Please configure credentials in Settings.');
    }
  }
  return driver.session();
}

/**
 * Run a read query with parameters.
 */
export async function readQuery(
  cypher: string,
  params: Record<string, any> = {}
): Promise<Neo4jRecord[]> {
  const session = await getSession();
  try {
    const result = await session.readTransaction(tx => tx.run(cypher, params));
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Run a write query with parameters.
 */
export async function writeQuery(
  cypher: string,
  params: Record<string, any> = {}
): Promise<Neo4jRecord[]> {
  const session = await getSession();
  try {
    const result = await session.writeTransaction(tx => tx.run(cypher, params));
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Run multiple queries in a single transaction
 */
export async function writeTransaction(
  queries: Array<{ cypher: string; params: Record<string, any> }>
): Promise<void> {
  const session = await getSession();
  try {
    await session.writeTransaction(async tx => {
      for (const q of queries) {
        await tx.run(q.cypher, q.params);
      }
    });
  } finally {
    await session.close();
  }
}

/**
 * Test connection — returns true if connected
 */
export async function testConnection(): Promise<boolean> {
  try {
    if (!driver) {
      return await initNeo4j();
    }
    await driver.verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the driver
 */
export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Remove a student and owned learning subgraph (best-effort per known labels).
 */
export async function deleteStudentCascade(studentId: string): Promise<void> {
  const steps = [
    `MATCH (:Student {id:$studentId})-[:ATTEMPTED]->(n:Quiz) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_RELATIONSHIP]->(n:SubjectRelationship) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_EXAM]->(n:Exam) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:STUDIED]->(n:StudySession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_MOOD]->(n:MoodLog) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:SUBMITTED]->(n:AnswerSubmission) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(:DiagnosticRun)-[:HAS_ATTEMPT]->(a:DiagnosticAttempt) DETACH DELETE a`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun) DETACH DELETE r`,
    `MATCH (:Student {id:$studentId})-[:HAS_STUDY_PLAN]->(n:StudyPlan) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_DOUBT]->(n:DoubtSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_TIMETABLE_SLOT]->(n:TimetableSlot) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:COMPLETED_REVIEW]->(n:ReviewSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_BASELINE]->(n:BaselineTest) DETACH DELETE n`,
    `MATCH (s:Student {id:$studentId}) DETACH DELETE s`,
  ];
  for (const cypher of steps) {
    await writeQuery(cypher, { studentId });
  }
}
