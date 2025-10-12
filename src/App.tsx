import { useEffect, useState } from "react";
import TodoModal from "./components/TodoModal";
import ModifyTodoModal from "./components/ModifyTodoModal";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from '@aws-amplify/ui-react';
import "./App.css";

const client = generateClient<Schema>();

function App() {
const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
const [showModal, setShowModal] = useState(false);
const [showModifyModal, setShowModifyModal] = useState(false);
const [modifyTodoId, setModifyTodoId] = useState<string | null>(null);
const [modifyTodoContent, setModifyTodoContent] = useState("");
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

function openModifyModal(id: string, content: string) {
  setModifyTodoId(id);
  setModifyTodoContent(content);
  setShowModifyModal(true);
}

function handleModifyCancel() {
  setShowModifyModal(false);
  setModifyTodoId(null);
  setModifyTodoContent("");
}

function handleUpdate(content: string) {
  if (modifyTodoId) {
    client.models.Todo.update({ id: modifyTodoId, content });
  }
  handleModifyCancel();
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
<th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {todos.map((todo) => (
              <tr
                key={todo.id}
                style={{ cursor: "default" }}
              >
                <td>{todo.content}</td>
                <td>{todo.isDone ? "Done" : "Pending"}</td>
<td>{new Date(todo.createdAt).toLocaleDateString()}</td>
<td>{new Date(todo.updatedAt).toLocaleDateString()}</td>
                <td>
<a
  href="#"
  className="action-link modify-link"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    if (todo.id && todo.content) {
      openModifyModal(todo.id!, todo.content!);
    }
  }}
>
  Modify
</a>
                  {" | "}
<a
  href="#"
  className="action-link delete-link"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    deleteTodo(todo.id);
  }}
>
  Delete
</a>
                </td>
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
      <ModifyTodoModal
        isOpen={showModifyModal}
        onClose={handleModifyCancel}
        onUpdate={handleUpdate}
        initialContent={modifyTodoContent}
      />
    </>
  );
  
}

export default App;
