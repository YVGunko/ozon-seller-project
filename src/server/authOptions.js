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
        const user = await findUserByCredentials(
          credentials?.username,
          credentials?.password
        );
        if (!user) {
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          allowedProfiles: user.allowedProfiles || [],
          roles: user.roles || [],
          enterpriseIds: user.enterpriseIds || [],
          enterpriseId: user.enterpriseId || null
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.allowedProfiles = user.allowedProfiles || [];
        token.roles = user.roles || [];
        token.enterpriseIds = user.enterpriseIds || [];
        token.enterpriseId = user.enterpriseId || null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.sub;
        session.user.allowedProfiles = token.allowedProfiles || [];
        session.user.roles = token.roles || [];
        session.user.enterpriseIds = token.enterpriseIds || [];
        session.user.enterpriseId = token.enterpriseId || null;
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
