import CredentialsProvider from 'next-auth/providers/credentials';
import { findUserByCredentials } from './userStore';

const { NEXTAUTH_SECRET } = process.env;
const buildAuthOptions = () => ({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const user = findUserByCredentials(credentials?.username, credentials?.password);
        if (user) {
          return {
            id: user.id,
            name: user.name,
            allowedProfiles: user.allowedProfiles || [],
            roles: user.roles || []
          };
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.allowedProfiles = user.allowedProfiles || [];
        token.roles = user.roles || [];
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub;
        session.user.allowedProfiles = token.allowedProfiles || [];
        session.user.roles = token.roles || [];
      }
      return session;
    }
  },
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/auth/signin'
  },
  secret: NEXTAUTH_SECRET
});

export const authOptions = buildAuthOptions();
