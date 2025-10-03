CREATE TABLE IF NOT EXISTS yahoo_data (
    id SERIAL PRIMARY KEY,
    class_index INT NOT NULL,
    question_title TEXT,
    question_content TEXT,
    best_answer TEXT
);
