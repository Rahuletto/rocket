import { BiLogoTypescript } from "react-icons/bi";
import { RiJavascriptFill } from "react-icons/ri";
import {
  FaCss3,
  FaImage,
  FaMarkdown,
  FaReact,
  FaSquareFontAwesome,
  FaHtml5,
  FaCircleInfo,
  FaRust,
  FaFile,
  FaGitAlt,
} from "react-icons/fa6";
import { HiGif } from "react-icons/hi2";
import { ImSvg } from "react-icons/im";
import { IoLogoNodejs } from "react-icons/io5";
import { IconProps } from "../types/Icon";

const icons: { [key: string]: JSX.Element } = {
  tsx: <FaReact color="#3178C6" />,
  jsx: <FaReact color="#61DAFB" />,
  css: <FaCss3 color="#1572B6" />,
  svg: <ImSvg color="#ffbb33" />,
  png: <FaImage color="#31c47d" />,
  icns: <FaSquareFontAwesome color="#346ed9" />,
  ico: <FaSquareFontAwesome color="#346ed9" />,
  gif: <HiGif color="#858585" />,
  jpeg: <FaImage color="#31c47d" />,
  jpg: <FaImage color="#31c47d" />,
  tiff: <FaImage color="#31c47d" />,
  bmp: <FaImage color="#31c47d" />,
  ts: <BiLogoTypescript color="#3178C6" />,
  js: <RiJavascriptFill color="#F0DB4F" />,
  json: <IoLogoNodejs color="#5fa04e" />,
  md: <FaMarkdown color="#ed8f4c" />,
  lock: <FaCircleInfo color="#69a6f0" />,
  gitignore: <FaGitAlt color="#F34F29" />,
  html: <FaHtml5 color="#E44D26" />,
  rs: <FaRust color="#FFA83D" />,
};

export default function FileIcon({ name, size = "base" }: IconProps) {
  const dot = name.lastIndexOf(".");
  const fileType = dot !== -1 ? name.slice(dot + 1).toLowerCase() : "NONE";
  const cls = size === "base" ? "w-4" : "w-3";

  if (icons[fileType]) {
    return <span className={cls}>{icons[fileType]}</span>;
  }

  return <FaFile />;
}
