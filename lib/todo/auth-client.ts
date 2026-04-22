export type TodoUser = {
  uid: string;
  email?: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

type Unsubscribe = () => void;

class TodoAuthClient {
  currentUser: TodoUser | null = null;

  onAuthStateChanged(callback: (user: TodoUser | null) => void): Unsubscribe {
    callback(this.currentUser);
    return () => {};
  }
}

export const auth = new TodoAuthClient();

export async function signOutClient() {
  console.log("TODO: implement auth");
}
