import { useEffect, useState } from "react";
import TodoModal from "./components/TodoModal";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from '@aws-amplify/ui-react';
import "./App.css";

const client = generateClient<Schema>();

function App() {
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [showModal, setShowModal] = useState(false);
  // Removed local newContent state; TodoModal manages its own input state
  const { user, signOut } = useAuthenticator();

  useEffect(() => {
    client.models.Todo.observeQuery().subscribe({
      next: (data) => setTodos([...data.items]),
    });
  }, []);

  function openCreateModal() {
    setShowModal(true);
  }

  function handleCancel() {
    setShowModal(false);
  }

  // handleSubmit is now managed inside TodoModal component

    
  function deleteTodo(id: string) {
    client.models.Todo.delete({ id })
  }

  // Called by TodoModal when a new todo is submitted
  function handleCreate(content: string) {
    client.models.Todo.create({ content });
  }

  return (
    <>
      <main>
        <h1>{user?.signInDetails?.loginId}'s todos</h1>
        
        <table className="todo-table">
          <thead>
            <tr>
              <th>Content</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {todos.map((todo) => (
              <tr
                onClick={() => deleteTodo(todo.id)}
                key={todo.id}
                style={{ cursor: "pointer" }}
              >
                <td>{todo.content}</td>
                <td>{todo.isDone ? "Done" : "Pending"}</td>
                <td>{new Date(todo.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <button onClick={openCreateModal}>+ new</button>
        <div>
          🥳 App successfully hosted. Try creating a new todo.
          <br />
          <a href="https://docs.amplify.aws/react/start/quickstart/#make-frontend-updates">
            Review next step of this tutorial.
          </a>
        </div>
        
        <button onClick={signOut}>Sign out</button>
      </main>
      <TodoModal isOpen={showModal} onClose={handleCancel} onCreate={handleCreate} />
    </>
  );
  
}

export default App;
