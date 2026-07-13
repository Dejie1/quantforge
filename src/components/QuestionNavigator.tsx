import type { SessionState } from "../domain/session/types";

export interface QuestionNavigatorProps {
  onNavigate: (index: number) => void;
  session: SessionState;
}

export function QuestionNavigator({ onNavigate, session }: QuestionNavigatorProps) {
  return (
    <nav className="question-navigator" aria-label="Question navigator">
      <ol>
        {session.questions.map((question, index) => {
          const answered = session.answers[question.id] !== undefined;
          const current = index === session.currentIndex;
          const state = answered ? "answered" : "unanswered";

          return (
            <li key={question.id}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                aria-label={`Question ${index + 1}, ${state}${current ? ", current" : ""}`}
                onClick={() => onNavigate(index)}
              >
                {index + 1}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
