export interface UserDocument {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}
