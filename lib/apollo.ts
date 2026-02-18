import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { graphQlUrl } from "@/lib/api-config";

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: graphQlUrl,
    credentials: "include",
  }),
  cache: new InMemoryCache(),
});
