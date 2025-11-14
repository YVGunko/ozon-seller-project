import NextAuth from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';

export default NextAuth(authOptions);
