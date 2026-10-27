import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env.js';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'manager';
  createdAt: string;
  lastLoginAt?: string;
}

const usersFilePath = path.resolve('./data/users.json');

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + config.authSecret).digest('hex');
}

function ensureUsersFile(): AppUser[] {
  const dir = path.dirname(usersFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(usersFilePath)) {
    // Khởi tạo user Admin mặc định
    const defaultAdmin: AppUser = {
      id: 'usr_admin',
      username: config.adminUsername || 'admin',
      name: 'Quản Trị Viên (Admin)',
      passwordHash: hashPassword(config.adminPassword || 'ecotrang2026'),
      role: 'admin',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(usersFilePath, JSON.stringify([defaultAdmin], null, 2), 'utf8');
    return [defaultAdmin];
  }

  try {
    const raw = fs.readFileSync(usersFilePath, 'utf8');
    const users = JSON.parse(raw);
    if (Array.isArray(users)) return users;
    return [];
  } catch {
    return [];
  }
}

function saveUsers(users: AppUser[]): void {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
}

export function getAllUsers(): AppUser[] {
  return ensureUsersFile();
}

export function getUserById(id: string): AppUser | null {
  const users = ensureUsersFile();
  return users.find((u) => u.id === id) || null;
}

export function getUserByUsername(username: string): AppUser | null {
  const users = ensureUsersFile();
  const clean = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === clean) || null;
}

export function createUser(username: string, password: string, name: string, role: 'admin' | 'manager' = 'manager'): AppUser {
  const users = ensureUsersFile();
  const cleanUsername = username.trim().toLowerCase();

  if (users.some((u) => u.username.toLowerCase() === cleanUsername)) {
    throw new Error(`Tài khoản "${username}" đã tồn tại trên hệ thống.`);
  }

  const newUser: AppUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    username: cleanUsername,
    name: name.trim() || cleanUsername,
    passwordHash: hashPassword(password),
    role,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);
  return newUser;
}

export function validateUserPassword(username: string, password: string): AppUser | null {
  const user = getUserByUsername(username);
  if (!user) return null;

  const hash = hashPassword(password);
  if (user.passwordHash === hash) {
    user.lastLoginAt = new Date().toISOString();
    const users = ensureUsersFile();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
      saveUsers(users);
    }
    return user;
  }

  return null;
}
