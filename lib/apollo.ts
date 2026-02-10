import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: process.env.EXPO_PUBLIC_GRAPHQL_URL,
  }),
  cache: new InMemoryCache(),
});
