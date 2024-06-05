use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug)]
pub struct FileStruct {
    name: String,
    kind: String,
    path: String,
}

pub fn read_directory(dir_path: &str) -> String {
    let new_path = Path::new(dir_path);
    let paths = fs::read_dir(new_path).unwrap();

    let mut files: Vec<FileStruct> = Vec::new();

    for path in paths {
        let path_unwrap = path.unwrap();
        let meta = path_unwrap.metadata();
        let meta_unwrap = meta.unwrap();

        let mut kind = String::from("file");

        if meta_unwrap.is_dir() {
            kind = String::from("directory");
        }

        let filename = match path_unwrap.file_name().into_string() {
            Ok(str) => str,
            Err(_error) => String::from("Crash!"),
        };

        let file_path = dir_path.to_owned() + &filename;

        let new_file_info = FileStruct {
            name: filename,
            kind,
            path: file_path,
        };

        files.push(new_file_info);
    }

    let files_str = match serde_json::to_string(&files) {
        Ok(str) => str,
        Err(error) => panic!("Problem opening the file: {:?}", error),
    };


    files_str
}


pub fn read_file(path: &str) -> String {
    let contents = fs::read_to_string(path).expect("Crash!");
    contents
}

pub fn write_file(path: &str, content: &str) -> String {
    let file_path = Path::new(path);
    let result = match fs::write(file_path, content) {
        Ok(()) => String::from("Success"),
        Err(_err) => String::from("Crash!")
    };

    result
}

pub fn create_folder(path: &str) -> String{
    let dir_path = Path::new(path);
    let result: String = match fs::create_dir(dir_path){
        Ok(()) => String::from("Success"),
        Err(_err) => String::from("Crash!")
    };

    result
}

pub fn remove_file(path: &str) -> String {
    let file_path = Path::new(path);
    let result: String = match fs::remove_file(file_path) {
        Ok(()) => String::from("Success"),
        Err(_err) => String::from("Crash!")
    };

    result
}

pub fn remove_folder(path: &str) -> String { 
    let folder_path = Path::new(path);
    let result: String = match fs::remove_dir_all(folder_path) {
        Ok(()) => String::from("Success"),
        Err(_err) => String::from("Crash!")
    };

    result
}
